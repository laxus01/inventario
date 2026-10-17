import { Component, effect, inject, signal, untracked, OnInit } from '@angular/core';
import {
  IonContent,
  IonSpinner,
} from '@ionic/angular';
import { ActividadUsuario, Usuario } from '../../models/inventario.models';
import { ResumenReportes, ReportesService } from '../../core/services/reportes.service';
import { etiquetaFecha } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

interface Metrica {
  etiqueta: string;
  valor: string;
  color?: string;
}

interface GrupoMetricas {
  titulo: string;
  icono: string;
  metricas: Metrica[];
}

@Component({
  selector: 'app-reportes',
  templateUrl: './reportes.page.html',
  styleUrls: ['./reportes.page.scss'],
  imports: [
    IonContent,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    AppIconComponent,
    FiltroFechaComponent,
  ],
})
export class ReportesPage implements OnInit {
  private readonly reportesService = inject(ReportesService);

  readonly resumen = signal<ResumenReportes | null>(null);
  readonly cargando = signal(true);
  readonly fechaFiltro = signal<string | null>(null);
  readonly inventarioAbierto = signal(false);
  readonly usuarios = signal<Usuario[]>([]);
  readonly usuarioSeleccionado = signal<number | null>(null);
  readonly actividad = signal<ActividadUsuario[]>([]);

  toggleInventario(): void {
    this.inventarioAbierto.update((abierto) => !abierto);
  }

  constructor() {
    console.log('[reportes] página creada');
    effect(() => {
      const fecha = this.fechaFiltro();
      const usuario = this.usuarioSeleccionado();
      console.log('[reportes] effect, fecha =', fecha, ', usuario =', usuario);
      untracked(() => this.cargarResumen(fecha, usuario));
    });
  }

  ngOnInit(): void {
    console.log('[reportes] ngOnInit');
  }

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  private async cargarResumen(fecha: string | null, usuario: number | null): Promise<void> {
    console.log('[reportes] cargarResumen, fecha =', fecha, ', usuario =', usuario);
    this.cargando.set(true);
    try {
      const [resumen, actividad, usuarios] = await Promise.all([
        this.reportesService.obtenerResumen(fecha, usuario),
        this.reportesService.obtenerActividadUsuarios(fecha),
        this.reportesService.obtenerUsuarios(),
      ]);
      this.resumen.set(resumen);
      this.actividad.set(actividad);
      this.usuarios.set(usuarios);
    } finally {
      this.cargando.set(false);
    }
  }

  private grupos(r: ResumenReportes, conFiltro: boolean): GrupoMetricas[] {
    const etiquetaDia = conFiltro ? 'Ventas del día' : 'Ventas de hoy';
    const etiquetaGananciaDia = conFiltro ? 'Ganancia del día' : 'Ganancia de hoy';
    return [
      {
        titulo: 'Caja',
        icono: 'ms:savings',
        metricas: [
          { etiqueta: 'Base en efectivo', valor: this.moneda(r.baseEfectivo) },
          { etiqueta: 'Base en cuenta', valor: this.moneda(r.baseCuenta) },
          {
            etiqueta: 'Efectivo en caja (base + recaudo)',
            valor: this.moneda(r.baseEfectivo + r.recaudoEfectivo),
            color: 'success',
          },
          {
            etiqueta: 'Saldo en cuenta (base + recaudo)',
            valor: this.moneda(r.baseCuenta + r.recaudoTransferencia),
            color: 'success',
          },
        ],
      },
      {
        titulo: 'Recaudo',
        icono: 'ms:payments',
        metricas: [
          { etiqueta: 'Recaudado en efectivo', valor: this.moneda(r.recaudoEfectivo), color: 'success' },
          { etiqueta: 'Recaudado por transferencia', valor: this.moneda(r.recaudoTransferencia) },
          { etiqueta: 'Pendiente en créditos', valor: this.moneda(r.porCobrar), color: 'danger' },
        ],
      },
      {
        titulo: 'Ventas',
        icono: 'ms:shopping_cart',
        metricas: [
          { etiqueta: etiquetaDia, valor: this.moneda(r.ventasHoy) },
          { etiqueta: etiquetaGananciaDia, valor: this.moneda(r.gananciaHoy), color: 'success' },
          { etiqueta: 'Ventas totales', valor: this.moneda(r.ventasTotal) },
          { etiqueta: 'Ganancia total', valor: this.moneda(r.gananciaTotal), color: 'success' },
          { etiqueta: 'Número de ventas', valor: String(r.ventasCantidad) },
        ],
      },
      {
        titulo: 'Deudas',
        icono: 'ms:account_balance_wallet',
        metricas: [
          { etiqueta: 'Por cobrar', valor: this.moneda(r.porCobrar), color: 'danger' },
          { etiqueta: 'Por pagar', valor: this.moneda(r.porPagar), color: 'warning' },
        ],
      },
    ];
  }

  gruposDe(r: ResumenReportes | null): GrupoMetricas[] {
    return r ? this.grupos(r, !!this.fechaFiltro()) : [];
  }

  private moneda(valor: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(valor);
  }

  // ===== Informe de actividad por usuario =====

  /** Actividad filtrada por el usuario elegido (null = todos, agregada). */
  actividadFiltrada(): ActividadUsuario[] {
    const usuario = this.usuarioSeleccionado();
    const lista = this.actividad();
    return usuario == null ? lista : lista.filter((a) => a.usuario_id === usuario);
  }

  private sumar(lista: ActividadUsuario[], campo: keyof ActividadUsuario): number {
    return lista.reduce((total, a) => total + (a[campo] as number), 0);
  }

  /** Actividad del usuario (o de todos) agrupada por tipo de operación. */
  gruposActividad(): GrupoMetricas[] {
    const lista = this.actividadFiltrada();
    if (lista.length === 0) return [];
    const t = (fn: (a: ActividadUsuario) => number) => lista.reduce((s, a) => s + fn(a), 0);

    return [
      {
        titulo: 'Ventas',
        icono: 'ms:shopping_cart',
        metricas: [
          { etiqueta: 'Ventas realizadas', valor: String(t((a) => a.ventasCantidad)) },
          { etiqueta: 'Recaudo', valor: this.moneda(t((a) => a.ventasTotal)) },
          { etiqueta: 'Ganancia', valor: this.moneda(t((a) => a.ventasGanancia)), color: 'success' },
        ],
      },
      {
        titulo: 'Compras',
        icono: 'ms:local_shipping',
        metricas: [
          { etiqueta: 'Compras registradas', valor: String(t((a) => a.comprasCantidad)) },
          { etiqueta: 'Valor comprado', valor: this.moneda(t((a) => a.comprasTotal)) },
        ],
      },
      {
        titulo: 'Créditos',
        icono: 'ms:account_balance_wallet',
        metricas: [
          { etiqueta: 'Cuentas por cobrar creadas', valor: String(t((a) => a.cuentasCobrar)) },
          { etiqueta: 'Abonos registrados', valor: String(t((a) => a.abonosCantidad)) },
          { etiqueta: 'Recaudo en abonos', valor: this.moneda(t((a) => a.abonosTotal)), color: 'success' },
          { etiqueta: 'Cuentas por pagar creadas', valor: String(t((a) => a.cuentasPagar)) },
          { etiqueta: 'Pagos a proveedores', valor: String(t((a) => a.pagosCantidad)) },
          { etiqueta: 'Valor pagado', valor: this.moneda(t((a) => a.pagosTotal)) },
        ],
      },
      {
        titulo: 'Inventario',
        icono: 'ms:inventory',
        metricas: [
          { etiqueta: 'Movimientos registrados', valor: String(t((a) => a.movimientos)) },
          { etiqueta: 'Productos creados', valor: String(t((a) => a.productosCreados)) },
        ],
      },
      {
        titulo: 'Catálogo',
        icono: 'ms:category',
        metricas: [
          { etiqueta: 'Categorías creadas', valor: String(t((a) => a.categoriasCreadas)) },
          { etiqueta: 'Clientes creados', valor: String(t((a) => a.clientesCreados)) },
          { etiqueta: 'Proveedores creados', valor: String(t((a) => a.proveedoresCreados)) },
        ],
      },
    ];
  }
}
