import { Injectable, inject } from '@angular/core';
import { ActividadUsuario, ProductoStockBajo, Usuario } from '../../models/inventario.models';
import { BasesService } from './bases.service';
import { CuentasCobrarService } from './cuentas-cobrar.service';
import { CuentasPagarService } from './cuentas-pagar.service';
import { SqliteService } from './sqlite.service';
import { hoyIso } from '../utils/fechas';

export interface ResumenReportes {
  ventasTotal: number;
  ventasHoy: number;
  gananciaTotal: number;
  gananciaHoy: number;
  ventasCantidad: number;
  recaudoEfectivo: number;
  recaudoTransferencia: number;
  baseEfectivo: number;
  baseCuenta: number;
  comprasTotal: number;
  porCobrar: number;
  porPagar: number;
  valorInventario: number;
  productosActivos: number;
  productosStockBajo: number;
  productosStockBajoLista: ProductoStockBajo[];
}

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly sqlite = inject(SqliteService);
  private readonly bases = inject(BasesService);
  private readonly cuentasCobrar = inject(CuentasCobrarService);
  private readonly cuentasPagar = inject(CuentasPagarService);

  async obtenerResumen(fecha?: string | null, usuarioId?: number | null): Promise<ResumenReportes> {
    const [ventas, ventasDia, recaudo, comprasTotal, porCobrar, porPagar, valorInventario, productosActivos, productosStockBajo, productosStockBajoLista, base] =
      await Promise.all([
        this.sqlite.getResumenVentas(null, usuarioId),
        fecha ? this.sqlite.getResumenVentas(fecha, usuarioId) : this.sqlite.getResumenVentasHoy(usuarioId),
        this.sqlite.getRecaudoPorMetodo(fecha, usuarioId),
        this.sqlite.getResumenCompras(fecha, usuarioId),
        this.cuentasCobrar.totalPorCobrar(fecha, usuarioId),
        this.cuentasPagar.totalPorPagar(fecha, usuarioId),
        this.sqlite.getValorInventario(),
        this.sqlite.getCantidadProductos(),
        this.sqlite.getProductosStockBajo(),
        this.sqlite.getProductosConStockBajo(),
        this.bases.porFecha(fecha ?? hoyIso(), usuarioId),
      ]);

    const ventasTotales = fecha ? ventasDia : ventas;

    return {
      ventasTotal: ventasTotales.total,
      ventasCantidad: ventasTotales.cantidad,
      ventasHoy: ventasDia.total,
      gananciaTotal: ventasTotales.ganancia,
      gananciaHoy: ventasDia.ganancia,
      recaudoEfectivo: recaudo.efectivo,
      recaudoTransferencia: recaudo.transferencia,
      baseEfectivo: base.efectivo,
      baseCuenta: base.cuenta,
      comprasTotal,
      porCobrar,
      porPagar,
      valorInventario,
      productosActivos,
      productosStockBajo,
      productosStockBajoLista,
    };
  }

  /** Actividad por usuario (ventas, compras, etc.) para el informe de auditoría. */
  async obtenerActividadUsuarios(fecha?: string | null): Promise<ActividadUsuario[]> {
    return this.sqlite.getActividadPorUsuario(fecha);
  }

  /** Lista de usuarios para el selector del informe de actividad. */
  async obtenerUsuarios(): Promise<Usuario[]> {
    return this.sqlite.getUsuarios();
  }
}
