import { Injectable, inject } from '@angular/core';
import { Compra, CompraDetalle, Lote, LineaCompra } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class CompraService {
  private readonly sqlite = inject(SqliteService);

  /**
   * Registra la compra: por cada línea crea un lote con el costo unitario
   * calculado a partir del costo total de la factura (costeo FIFO) y un
   * movimiento de entrada que incrementa el stock.
   */
  async crear(proveedorId: number, lineas: LineaCompra[]): Promise<number> {
    const total = lineas.reduce(
      (suma, l) => suma + (Number(l.costo_total) || 0),
      0,
    );
    const compraId = await this.sqlite.addCompra({ proveedor_id: proveedorId, total });
    await this.registrarLineas(compraId, lineas);
    return compraId;
  }

  /**
   * Elimina la compra revirtiendo el inventario: retira las unidades que sus
   * lotes aportaron, registra movimientos de salida compensatorios y anula la
   * cuenta por pagar si era a crédito. Falla si alguna venta ya consumió
   * unidades de sus lotes (en ese caso deben eliminarse primero las ventas).
   */
  async eliminar(compraId: number): Promise<void> {
    const detalles = await this.sqlite.getCompraDetalle(compraId);
    const pares = await this.lotesDeDetalles(detalles);
    await this.revertirInventario(compraId, pares);
    await this.sqlite.eliminarCompra(compraId);
    const cuenta = await this.sqlite.getCuentaPagarPorCompra(compraId);
    if (cuenta) await this.sqlite.eliminarCuentaPagar(cuenta.id!);
  }

  /**
   * Edita la compra completa: revierte los lotes originales (deben estar
   * intactos), vuelve a crear lotes y movimientos con las nuevas líneas y
   * actualiza el proveedor, el total y la cuenta por pagar asociada.
   */
  async editar(
    compraId: number,
    proveedorId: number,
    lineas: LineaCompra[],
    esCredito: boolean,
  ): Promise<void> {
    const detalles = await this.sqlite.getCompraDetalle(compraId);
    const pares = await this.lotesDeDetalles(detalles);
    await this.revertirInventario(compraId, pares);
    const total = await this.registrarLineas(compraId, lineas);
    await this.sqlite.updateCompra(compraId, proveedorId, total);
    await this.sincronizarCuentaPagar(compraId, proveedorId, total, esCredito);
  }

  /**
   * Resuelve el lote de cada línea de detalle. Las compras nuevas guardan
   * lote_id; para las anteriores se deduce buscando el lote intacto del
   * producto con la misma cantidad y costo. Lanza error si el lote ya fue
   * consumido por ventas (la reversión dejaría el inventario inconsistente).
   */
  private async lotesDeDetalles(detalles: CompraDetalle[]): Promise<{ detalle: CompraDetalle; lote: Lote }[]> {
    const pares: { detalle: CompraDetalle; lote: Lote }[] = [];
    const deducidos = new Set<number>();
    for (const detalle of detalles) {
      let lote: Lote | undefined;
      if (detalle.lote_id) {
        lote = await this.sqlite.getLote(detalle.lote_id);
      } else {
        const candidatos = await this.sqlite.consultar<Lote>(
          `SELECT * FROM lotes
           WHERE producto_id = ? AND cantidad_inicial = ? AND costo_unitario = ?
             AND cantidad_restante = cantidad_inicial
           ORDER BY id`,
          [detalle.producto_id, detalle.cantidad, detalle.costo_unitario],
        );
        lote = candidatos.find((l) => !deducidos.has(l.id!));
      }
      if (!lote) {
        throw new Error(
          'No se puede revertir: hay ventas que consumieron inventario de esta compra. Elimina primero las ventas relacionadas.',
        );
      }
      deducidos.add(lote.id!);
      pares.push({ detalle, lote });
    }
    return pares;
  }

  /** Retira del stock las unidades que aportaron los lotes de la compra. */
  private async revertirInventario(
    compraId: number,
    pares: { detalle: CompraDetalle; lote: Lote }[],
  ): Promise<void> {
    const porProducto = new Map<number, number>();
    for (const { detalle, lote } of pares) {
      if (lote.cantidad_restante < detalle.cantidad) {
        throw new Error(
          'No se puede revertir: hay ventas que consumieron inventario de esta compra. Elimina primero las ventas relacionadas.',
        );
      }
      await this.sqlite.reducirLote(lote.id!, detalle.cantidad);
      porProducto.set(
        detalle.producto_id,
        (porProducto.get(detalle.producto_id) ?? 0) + detalle.cantidad,
      );
    }
    for (const [productoId, cantidad] of porProducto) {
      await this.sqlite.addMovimiento({
        producto_id: productoId,
        tipo: 'salida',
        cantidad,
        motivo: `Anulación Compra #${compraId}`,
      });
    }
  }

  /** Crea lote, detalle (con el enlace al lote) y movimiento de entrada por línea. */
  private async registrarLineas(compraId: number, lineas: LineaCompra[]): Promise<number> {
    let total = 0;
    for (const linea of lineas) {
      const cantidad = Number(linea.cantidad) || 0;
      const costoTotal = Number(linea.costo_total) || 0;
      const costoUnitario = cantidad > 0 ? costoTotal / cantidad : 0;
      const loteId = await this.sqlite.addLote({
        producto_id: linea.producto_id!,
        cantidad_inicial: cantidad,
        cantidad_restante: cantidad,
        costo_unitario: costoUnitario,
      });
      await this.sqlite.addCompraDetalle({
        compra_id: compraId,
        producto_id: linea.producto_id!,
        lote_id: loteId,
        cantidad,
        costo_unitario: costoUnitario,
      });
      await this.sqlite.addMovimiento({
        producto_id: linea.producto_id!,
        tipo: 'entrada',
        cantidad,
        motivo: `Compra #${compraId}`,
      });
      total += costoTotal;
    }
    return total;
  }

  /** Ajusta la cuenta por pagar según si la compra editada sigue a crédito. */
  private async sincronizarCuentaPagar(
    compraId: number,
    proveedorId: number,
    total: number,
    esCredito: boolean,
  ): Promise<void> {
    const cuenta = await this.sqlite.getCuentaPagarPorCompra(compraId);
    if (esCredito) {
      if (cuenta) {
        if ((cuenta.abonado ?? 0) > total) {
          throw new Error('Los pagos registrados superan el nuevo total de la compra');
        }
        await this.sqlite.updateCuentaPagar(cuenta.id!, proveedorId, total);
      } else {
        await this.sqlite.addCuentaPagar({
          compra_id: compraId,
          proveedor_id: proveedorId,
          total,
          concepto: null,
        });
      }
    } else if (cuenta) {
      if ((cuenta.abonado ?? 0) > 0) {
        throw new Error('La compra tiene pagos registrados; elimínalos antes de quitar el crédito');
      }
      await this.sqlite.eliminarCuentaPagar(cuenta.id!);
    }
  }

  async listar(): Promise<Compra[]> {
    return this.sqlite.getCompras();
  }

  async detalle(compraId: number): Promise<CompraDetalle[]> {
    return this.sqlite.getCompraDetalle(compraId);
  }
}
