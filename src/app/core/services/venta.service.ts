import { Injectable, inject } from '@angular/core';
import {
  LineaVenta,
  MetodoPago,
  MetodoPagoVenta,
  PartePagoMetodo,
  PagoVenta,
  Venta,
  VentaDetalle,
} from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

interface ConsumoLote {
  lote_id: number;
  cantidad: number;
  costo_unitario: number;
}

/**
 * Parte de pago con la que se cubre una venta (sin ids; los asigna la BD).
 * Las partes 'credito' no se guardan en venta_pagos: se materializan como
 * cuenta por cobrar por su monto (el cliente paga ese saldo después).
 */
export type PagoVentaNuevo = { metodo: PartePagoMetodo; monto: number };

/** Tolerancia al comparar la suma de pagos contra el total (redondeos flotantes). */
const TOLERANCIA_PAGOS = 0.01;

@Injectable({ providedIn: 'root' })
export class VentaService {
  private readonly sqlite = inject(SqliteService);

  /**
   * Registra la venta consumiendo lotes FIFO: cada línea puede generar varias
   * filas de detalle (una por lote consumido) con el costo real de cada lote,
   * de modo que la ganancia quede congelada con el costo verdadero.
   * Las líneas se expresan en presentaciones (ej. 2 cavas de 30); el stock y
   * los lotes siempre se consumen en unidades (cantidad × factor).
   * `partes` son las partes de pago; si alguna es 'credito' se crea una cuenta
   * por cobrar por ese monto (requiere `clienteId`).
   */
  async crear(
    lineas: LineaVenta[],
    partes: PagoVentaNuevo[] | null = null,
    nota?: string | null,
    clienteId?: number,
  ): Promise<number> {
    const { total, ganancia, consumosPorLinea } = await this.validarYConsumir(lineas);
    if (partes) this.validarPagos(partes, total);
    const credito = this.montoCredito(partes);
    if (credito > 0 && !clienteId) {
      throw new Error('Selecciona el cliente para la parte a crédito');
    }
    console.log('[ventas-debug] VentaService.crear: nota recibida =', JSON.stringify(nota));
    const ventaId = await this.sqlite.addVenta({
      total,
      ganancia,
      metodo_pago: this.etiquetaMetodo(partes),
      nota: nota?.trim() || null,
    });
    if (partes) await this.sqlite.addVentaPagos(ventaId, this.partesContado(partes));
    await this.registrarDetalles(ventaId, consumosPorLinea);
    if (credito > 0) {
      await this.sqlite.addCuentaCobrar({
        venta_id: ventaId,
        cliente_id: clienteId!,
        total: credito,
        concepto: null,
      });
    }
    return ventaId;
  }

  /**
   * Elimina la venta revirtiendo el inventario igual que se consumió al crearla:
   * devuelve las unidades a sus lotes originales, registra movimientos de
   * entrada compensatorios y anula la cuenta por cobrar si era a crédito.
   */
  async eliminar(ventaId: number): Promise<void> {
    await this.revertirInventario(ventaId);
    await this.sqlite.eliminarVenta(ventaId);
    const cuenta = await this.sqlite.getCuentaCobrarPorVenta(ventaId);
    if (cuenta) await this.sqlite.eliminarCuentaCobrar(cuenta.id!);
  }

  /**
   * Edita la venta completa: revierte el inventario original (lotes y stock),
   * vuelve a consumir lotes FIFO con las nuevas líneas y actualiza el total,
   * la ganancia, el método de pago, los pagos y la cuenta por cobrar asociada.
   */
  async editar(
    ventaId: number,
    lineas: LineaVenta[],
    partes: PagoVentaNuevo[] | null,
    clienteId?: number,
    nota?: string | null,
  ): Promise<void> {
    const detalles = await this.sqlite.getVentaDetalle(ventaId);
    await this.validarStockEdicion(detalles, lineas);
    const { total, ganancia, consumosPorLinea } = await this.validarYConsumir(lineas);
    if (partes) this.validarPagos(partes, total);
    const credito = this.montoCredito(partes);
    if (credito > 0 && !clienteId) {
      throw new Error('Selecciona el cliente para la parte a crédito');
    }
    console.log('[ventas-debug] VentaService.editar: venta', ventaId, '| nota recibida =', JSON.stringify(nota));
    await this.revertirInventario(ventaId);
    // Las filas de detalle originales se anulan para que no queden duplicadas
    // junto a las nuevas (getVentaDetalle filtra por deleted_at IS NULL).
    await this.sqlite.eliminarVentaDetalle(ventaId);
    await this.registrarDetalles(ventaId, consumosPorLinea);
    await this.sqlite.updateVenta(ventaId, total, ganancia, this.etiquetaMetodo(partes), nota?.trim() || null);
    await this.sqlite.eliminarVentaPagos(ventaId);
    if (partes) await this.sqlite.addVentaPagos(ventaId, this.partesContado(partes));
    await this.sincronizarCuentaCobrar(ventaId, credito, clienteId);
  }

  /** Valida que los pagos cubran exactamente el total de la venta. */
  private validarPagos(pagos: PagoVentaNuevo[], total: number): void {
    if (!pagos.length) throw new Error('Registra al menos un pago');
    const suma = pagos.reduce((suma, p) => suma + (Number(p.monto) || 0), 0);
    if (Math.abs(suma - total) > TOLERANCIA_PAGOS) {
      throw new Error('La suma de los pagos no coincide con el total de la venta');
    }
  }

  /** Etiqueta para ventas.metodo_pago: el método único, 'mixto' o null (crédito). */
  private etiquetaMetodo(partes: PagoVentaNuevo[] | null): MetodoPagoVenta | null {
    if (!partes) return null;
    if (partes.length === 1) {
      return partes[0].metodo === 'credito' ? null : partes[0].metodo;
    }
    return 'mixto';
  }

  /** Suma de las partes a crédito de una venta (0 si no hay). */
  private montoCredito(partes: PagoVentaNuevo[] | null): number {
    return (partes ?? [])
      .filter((p) => p.metodo === 'credito')
      .reduce((suma, p) => suma + (Number(p.monto) || 0), 0);
  }

  /** Partes contado (efectivo/transferencia), las únicas que van a venta_pagos. */
  private partesContado(partes: PagoVentaNuevo[]): { metodo: MetodoPago; monto: number }[] {
    return partes
      .filter((p): p is PagoVentaNuevo & { metodo: MetodoPago } => p.metodo !== 'credito')
      .map((p) => ({ metodo: p.metodo, monto: p.monto }));
  }

  /** Valida stock considerando las unidades que la edición devolverá al inventario. */
  private async validarStockEdicion(detalles: VentaDetalle[], lineas: LineaVenta[]): Promise<void> {
    const originales = new Map<number, number>();
    for (const d of detalles) {
      originales.set(d.producto_id, (originales.get(d.producto_id) ?? 0) + d.cantidad);
    }
    const nuevas = new Map<number, number>();
    for (const linea of lineas) {
      const factor = Number(linea.factor) || 1;
      const unidades = (Number(linea.cantidad) || 0) * factor;
      nuevas.set(linea.producto_id!, (nuevas.get(linea.producto_id!) ?? 0) + unidades);
    }
    for (const [productoId, unidades] of nuevas) {
      const lotes = await this.sqlite.getLotes(productoId);
      const devuelto = originales.get(productoId) ?? 0;
      const disponible = lotes.reduce((suma, l) => suma + l.cantidad_restante, 0) + devuelto;
      if (disponible < unidades) {
        throw new Error(`Stock insuficiente: disponible ${disponible - devuelto}`);
      }
    }
  }

  /** Devuelve las unidades vendidas a sus lotes y registra la entrada compensatoria. */
  private async revertirInventario(ventaId: number): Promise<void> {
    const detalles = await this.sqlite.getVentaDetalle(ventaId);
    const porProducto = new Map<number, number>();
    for (const d of detalles) {
      await this.sqlite.restaurarLote(d.lote_id, d.cantidad);
      porProducto.set(d.producto_id, (porProducto.get(d.producto_id) ?? 0) + d.cantidad);
    }
    for (const [productoId, cantidad] of porProducto) {
      await this.sqlite.addMovimiento({
        producto_id: productoId,
        tipo: 'entrada',
        cantidad,
        motivo: `Anulación Venta #${ventaId}`,
      });
    }
  }

  private async validarYConsumir(lineas: LineaVenta[]): Promise<{
    total: number;
    ganancia: number;
    consumosPorLinea: { linea: LineaVenta; consumos: ConsumoLote[] }[];
  }> {
    const unidadesPorLinea = lineas.map((linea) => {
      const factor = Number(linea.factor) || 1;
      return { linea, factor, unidades: (Number(linea.cantidad) || 0) * factor };
    });

    for (const { linea, unidades } of unidadesPorLinea) {
      const lotes = await this.sqlite.getLotes(linea.producto_id!);
      const disponible = lotes.reduce((suma, l) => suma + l.cantidad_restante, 0);
      if (disponible < unidades) {
        throw new Error(`Stock insuficiente: disponible ${disponible}`);
      }
    }

    let total = 0;
    let ganancia = 0;
    const consumosPorLinea: { linea: LineaVenta; consumos: ConsumoLote[] }[] = [];

    for (const { linea, factor, unidades } of unidadesPorLinea) {
      const precio = Number(linea.precio_unitario) || 0;
      const precioUnidad = precio / factor;
      const consumos = await this.sqlite.consumirLotesFIFO(
        linea.producto_id!,
        unidades,
      );
      consumosPorLinea.push({ linea, consumos });
      for (const consumo of consumos) {
        total += consumo.cantidad * precioUnidad;
        ganancia += consumo.cantidad * (precioUnidad - consumo.costo_unitario);
      }
    }
    return { total, ganancia, consumosPorLinea };
  }

  private async registrarDetalles(
    ventaId: number,
    consumosPorLinea: { linea: LineaVenta; consumos: ConsumoLote[] }[],
  ): Promise<void> {
    for (const { linea, consumos } of consumosPorLinea) {
      const factor = Number(linea.factor) || 1;
      const precio = Number(linea.precio_unitario) || 0;
      const precioUnidad = precio / factor;
      for (const consumo of consumos) {
        await this.sqlite.addVentaDetalle({
          venta_id: ventaId,
          producto_id: linea.producto_id!,
          lote_id: consumo.lote_id,
          cantidad: consumo.cantidad,
          precio_unitario: precio,
          costo_unitario: consumo.costo_unitario,
          presentacion_nombre: linea.presentacion_nombre ?? null,
          presentacion_factor: factor > 1 ? factor : null,
        });
        await this.sqlite.addMovimiento({
          producto_id: linea.producto_id!,
          tipo: 'salida',
          cantidad: consumo.cantidad,
          motivo: `Venta #${ventaId}`,
        });
      }
    }
  }

  /** Ajusta la cuenta por cobrar según la parte a crédito resultante de la edición. */
  private async sincronizarCuentaCobrar(
    ventaId: number,
    credito: number,
    clienteId?: number,
  ): Promise<void> {
    const cuenta = await this.sqlite.getCuentaCobrarPorVenta(ventaId);
    if (credito > 0) {
      if (cuenta) {
        if ((cuenta.abonado ?? 0) > credito) {
          throw new Error('Los abonos registrados superan el nuevo monto a crédito');
        }
        await this.sqlite.updateCuentaCobrar(cuenta.id!, clienteId ?? cuenta.cliente_id, credito);
      } else {
        if (!clienteId) throw new Error('Selecciona el cliente para la parte a crédito');
        await this.sqlite.addCuentaCobrar({
          venta_id: ventaId,
          cliente_id: clienteId,
          total: credito,
          concepto: null,
        });
      }
    } else if (cuenta) {
      if ((cuenta.abonado ?? 0) > 0) {
        throw new Error('La venta tiene abonos registrados; elimínalos antes de quitar la parte a crédito');
      }
      await this.sqlite.eliminarCuentaCobrar(cuenta.id!);
    }
  }

  async listar(): Promise<Venta[]> {
    return this.sqlite.getVentas();
  }

  async detalle(ventaId: number): Promise<VentaDetalle[]> {
    return this.sqlite.getVentaDetalle(ventaId);
  }

  async pagos(ventaId: number): Promise<PagoVenta[]> {
    return this.sqlite.getVentaPagos(ventaId);
  }
}
