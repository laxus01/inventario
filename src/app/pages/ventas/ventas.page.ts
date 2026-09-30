import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import {
  LineaVenta,
  MetodoPago,
  MetodoPagoVenta,
  PagoVenta,
  Presentacion,
  Usuario,
  Venta,
  VentaDetalle,
} from '../../models/inventario.models';
import { PagoVentaNuevo, VentaService } from '../../core/services/venta.service';
import { AuthService } from '../../core/services/auth.service';
import { ProductoService } from '../../core/services/producto.service';
import { ClienteService } from '../../core/services/cliente.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { DatosRecibo, ImpresoraService } from '../../core/services/impresora.service';
import { formatoValorEsCo } from '../../shared/pipes/formato-valor.pipe';
import { etiquetaFecha } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoEnteroPipe, FormatoValorPipe, formatoEnteroEsCo } from '../../shared/pipes/formato-valor.pipe';
import { OpcionSelector, SelectorModalComponent } from '../../shared/components/selector-modal/selector-modal.component';
import { ReciboModalComponent } from '../../shared/components/recibo-modal/recibo-modal.component';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

@Component({
  selector: 'app-ventas',
  templateUrl: './ventas.page.html',
  styleUrls: ['./ventas.page.scss'],
  imports: [
    FormsModule,
    FormatoEnteroPipe,
    FormatoValorPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonList,
    IonSelect,
    IonSelectOption,
    IonModal,
    IonNote,
    IonFab,
    IonFabButton,
    IonSpinner,
    IonTextarea,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
    SelectorModalComponent,
    ReciboModalComponent,
    FiltroFechaComponent,
  ],
})
export class VentasPage {
  private readonly ventaService = inject(VentaService);
  private readonly auth = inject(AuthService);
  private readonly productoService = inject(ProductoService);
  private readonly clienteService = inject(ClienteService);
  private readonly sqlite = inject(SqliteService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);
  private readonly impresora = inject(ImpresoraService);

  readonly ventas = signal<Venta[]>([]);
  readonly detalles = signal<Record<number, VentaDetalle[]>>({});
  /** Pagos guardados por venta (solo se cargan para las ventas mixtas). */
  readonly pagosPorVenta = signal<Record<number, PagoVenta[]>>({});
  /** Parte a crédito por venta mixta (el total de su cuenta por cobrar). */
  readonly creditoPorVenta = signal<Record<number, number>>({});
  readonly clientes = signal<{ id?: number; nombre: string }[]>([]);
  readonly productos = signal<{ id?: number; nombre: string; stock: number; precio_venta: number; costo_actual?: number | null }[]>([]);
  readonly presentaciones = signal<Presentacion[]>([]);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  readonly lineas = signal<LineaVenta[]>([]);
  /** Venta en edición (null = nueva venta). */
  readonly ventaEditando = signal<Venta | null>(null);
  /** Unidades por producto que la venta original devolverá al stock al guardar la edición. */
  readonly unidadesOriginales = signal<Map<number, number>>(new Map());
  readonly selectorClientesAbierto = signal(false);
  /** Solo el administrador puede editar o eliminar registros. */
  readonly esAdmin = signal(false);

  // ===== Vista previa del recibo =====
  readonly reciboAbierto = signal(false);
  readonly ventaRecibo = signal<Venta | null>(null);
  readonly detallesRecibo = signal<VentaDetalle[]>([]);
  readonly pagosRecibo = signal<PagoVenta[]>([]);
  readonly clienteRecibo = signal<string | null>(null);
  /** Parte a crédito de la venta del recibo (0 si no tiene). */
  readonly creditoRecibo = signal(0);

  metodoPago: MetodoPago | 'credito' | 'mixto' = 'efectivo';
  /** Montos por método cuando el pago es mixto. */
  montoEfectivo: number | undefined;
  montoTransferencia: number | undefined;
  montoCredito: number | undefined;
  clienteId: number | undefined;
  /** Nota libre de la venta (referencia, observación); sale en el recibo. */
  nota: string | undefined;

  readonly selectorAbierto = signal(false);
  readonly selectorLinea = signal<number | null>(null);

  readonly opcionesProductos = computed<OpcionSelector[]>(() =>
    this.productos().map((p) => ({
      id: p.id!,
      nombre: p.nombre,
      detalle: `Stock: ${p.stock}`,
    })),
  );

  readonly opcionesClientes = computed<OpcionSelector[]>(() =>
    this.clientes().map((c) => ({ id: c.id!, nombre: c.nombre })),
  );

  // ===== Presentaciones de venta =====

  presentacionesDe(productoId: number): Presentacion[] {
    return this.presentaciones().filter((p) => p.producto_id === productoId);
  }

  presentacionDe(linea: LineaVenta): Presentacion | undefined {
    return linea.presentacion_id
      ? this.presentaciones().find((p) => p.id === linea.presentacion_id)
      : undefined;
  }

  factorDe(linea: LineaVenta): number {
    return this.presentacionDe(linea)?.factor ?? 1;
  }

  nombrePresentacion(linea: LineaVenta): string {
    return this.presentacionDe(linea)?.nombre ?? 'Unidad';
  }

  /** Precio por presentación: el propio de la presentación o factor × precio unitario. */
  precioLinea(linea: LineaVenta): number {
    const presentacion = this.presentacionDe(linea);
    if (presentacion?.precio_venta != null && presentacion.precio_venta > 0) {
      return presentacion.precio_venta;
    }
    const producto = this.productos().find((p) => p.id === linea.producto_id);
    return (producto?.precio_venta ?? 0) * this.factorDe(linea);
  }

  /** Unidades reales que consume la línea (cantidad de presentaciones × factor). */
  unidadesDe(linea: LineaVenta): number {
    return (Number(linea.cantidad) || 0) * this.factorDe(linea);
  }

  actualizarPresentacion(indice: number, valor: number): void {
    this.lineas.update((lineas) =>
      lineas.map((l, i) => (i === indice ? { ...l, presentacion_id: valor || undefined } : l)),
    );
  }

  /** Precio por unidad cuando el detalle guardó el precio por presentación. */
  precioPorUnidad(d: VentaDetalle): number {
    return d.presentacion_factor ? d.precio_unitario / d.presentacion_factor : d.precio_unitario;
  }

  readonly total = computed(() =>
    this.lineas().reduce((suma, l) => {
      return suma + this.unidadesDe(l) * (this.precioLinea(l) / this.factorDe(l));
    }, 0),
  );

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const ventas = await this.ventaService.listar();
      this.ventas.set(ventas);
      const mapa: Record<number, VentaDetalle[]> = {};
      for (const venta of ventas) {
        mapa[venta.id!] = await this.ventaService.detalle(venta.id!);
      }
      this.detalles.set(mapa);
      const pagos: Record<number, PagoVenta[]> = {};
      const creditos: Record<number, number> = {};
      for (const venta of ventas.filter((v) => v.metodo_pago === 'mixto')) {
        pagos[venta.id!] = await this.ventaService.pagos(venta.id!);
        const cuenta = await this.sqlite.getCuentaCobrarPorVenta(venta.id!);
        if (cuenta) creditos[venta.id!] = cuenta.total;
      }
      this.pagosPorVenta.set(pagos);
      this.creditoPorVenta.set(creditos);
      this.productos.set(await this.productoService.listar());
      this.presentaciones.set(await this.productoService.todasPresentaciones());
      this.clientes.set(await this.clienteService.listar());
      this.usuarios.set(await this.sqlite.getUsuarios());
    } finally {
      this.cargando.set(false);
    }
  }

  abrirNueva(): void {
    console.log('[ventas-debug] abrirNueva: campo nota =', JSON.stringify(this.nota));
    this.ventaEditando.set(null);
    this.unidadesOriginales.set(new Map());
    this.lineas.set([{}]);
    this.metodoPago = 'efectivo';
    this.montoEfectivo = undefined;
    this.montoTransferencia = undefined;
    this.montoCredito = undefined;
    this.clienteId = undefined;
    this.nota = undefined;
    this.modalAbierto.set(true);
  }

  /** Reconstruye las líneas de la venta a partir de su detalle (agrupando lotes). */
  async abrirEditar(v: Venta, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede editar ventas');
      return;
    }
    const detalles = await this.ventaService.detalle(v.id!);
    const grupos = new Map<string, { linea: LineaVenta; unidades: number }>();
    for (const d of detalles) {
      const factor = d.presentacion_factor ?? 1;
      const clave = `${d.producto_id}|${factor}|${d.precio_unitario}|${d.presentacion_nombre ?? ''}`;
      const existente = grupos.get(clave);
      if (existente) {
        existente.unidades += d.cantidad;
      } else {
        const presentacion = factor > 1
          ? this.presentaciones().find((p) => p.producto_id === d.producto_id && p.nombre === d.presentacion_nombre)
          : undefined;
        grupos.set(clave, {
          linea: {
            producto_id: d.producto_id,
            presentacion_id: presentacion?.id,
            presentacion_nombre: d.presentacion_nombre ?? undefined,
            factor,
            precio_unitario: d.precio_unitario,
          },
          unidades: d.cantidad,
        });
      }
    }
    const lineas = [...grupos.values()].map((g) => ({
      ...g.linea,
      cantidad: g.unidades / g.linea.factor!,
    }));
    if (!lineas.length) {
      await this.toast.advertencia('La venta no tiene productos registrados');
      return;
    }
    const cuenta = await this.sqlite.getCuentaCobrarPorVenta(v.id!);
    const pagos = await this.ventaService.pagos(v.id!);
    this.ventaEditando.set(v);
    this.unidadesOriginales.set(
      new Map([...grupos.values()].map((g) => [g.linea.producto_id!, g.unidades])),
    );
    this.lineas.set(lineas);
    this.metodoPago = this.metodoDesdePagos(pagos, cuenta, v.metodo_pago);
    this.montoEfectivo = pagos.find((p) => p.metodo === 'efectivo')?.monto;
    this.montoTransferencia = pagos.find((p) => p.metodo === 'transferencia')?.monto;
    this.montoCredito = cuenta?.total;
    this.clienteId = cuenta?.cliente_id;
    this.nota = v.nota ?? undefined;
    console.log('[ventas-debug] abrirEditar: venta', v.id, '| nota en BD =', JSON.stringify(v.nota), '| nota en modal =', JSON.stringify(this.nota));
    this.modalAbierto.set(true);
  }

  /**
   * Reconstruye el método de pago de la modal a partir de los pagos guardados
   * y la cuenta por cobrar (la parte crédito de una venta mixta).
   */
  private metodoDesdePagos(
    pagos: { metodo: MetodoPago; monto: number }[],
    cuenta: { total: number } | undefined,
    etiqueta: MetodoPagoVenta | null | undefined,
  ): MetodoPago | 'credito' | 'mixto' {
    if (pagos.length + (cuenta ? 1 : 0) > 1) return 'mixto';
    if (cuenta) return 'credito';
    if (pagos.length === 1) return pagos[0].metodo;
    // Venta antigua sin pagos registrados (o a crédito)
    return etiqueta === 'efectivo' || etiqueta === 'transferencia' ? etiqueta : 'credito';
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
    this.ventaEditando.set(null);
    this.unidadesOriginales.set(new Map());
    this.montoEfectivo = undefined;
    this.montoTransferencia = undefined;
    this.montoCredito = undefined;
    this.nota = undefined;
  }

  async agregarCliente(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Nuevo cliente',
      inputs: [{ name: 'nombre', type: 'text', placeholder: 'Nombre del cliente' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', handler: (datos) => this.crearCliente(datos.nombre) },
      ],
    });
    await alert.present();
  }

  private async crearCliente(nombre: string): Promise<boolean> {
    if (!nombre?.trim()) {
      await this.toast.advertencia('El nombre del cliente es obligatorio');
      return false;
    }
    try {
      const id = await this.clienteService.crear(nombre);
      this.clientes.set(await this.clienteService.listar());
      this.clienteId = id;
      await this.toast.exito('Cliente agregado');
      return true;
    } catch {
      await this.toast.error('No se pudo crear el cliente (¿nombre repetido?)');
      return false;
    }
  }

  agregarLinea(): void {
    this.lineas.update((lineas) => [...lineas, {}]);
  }

  quitarLinea(indice: number): void {
    this.lineas.update((lineas) => lineas.filter((_, i) => i !== indice));
  }

  actualizarCantidad(indice: number, valor: number | undefined): void {
    this.lineas.update((lineas) =>
      lineas.map((l, i) => (i === indice ? { ...l, cantidad: valor } : l)),
    );
  }

  abrirSelector(indice: number): void {
    this.selectorLinea.set(indice);
    this.selectorAbierto.set(true);
  }

  asignarProducto(id: number): void {
    const indice = this.selectorLinea();
    if (indice == null) return;
    this.lineas.update((lineas) =>
      lineas.map((l, i) => (i === indice ? { ...l, producto_id: id, presentacion_id: undefined } : l)),
    );
  }

  nombreProducto(id?: number): string {
    return this.productos().find((p) => p.id === id)?.nombre ?? '';
  }

  productoSeleccionado(): number | null {
    const indice = this.selectorLinea();
    if (indice == null) return null;
    return this.lineas()[indice]?.producto_id ?? null;
  }

  metodoLabel(venta: Venta): string {
    if (venta.metodo_pago === 'transferencia') return 'Transferencia';
    if (venta.metodo_pago === 'efectivo') return 'Efectivo';
    if (venta.metodo_pago === 'mixto') return 'Mixto';
    return 'Crédito';
  }

  metodoClase(venta: Venta): string {
    return venta.metodo_pago ?? 'credito';
  }

  /** Monto pagado con el método dado en una venta mixta (0 si no tiene esa parte). */
  pagoMixto(venta: Venta, metodo: MetodoPago | 'credito'): number {
    if (metodo === 'credito') return this.creditoPorVenta()[venta.id!] ?? 0;
    return this.pagosPorVenta()[venta.id!]?.find((p) => p.metodo === metodo)?.monto ?? 0;
  }

  /**
   * Partes de pago según el método elegido; string = estado inválido.
   * En el pago mixto cada método es opcional, pero deben usarse al menos dos
   * y la parte crédito exige cliente.
   */
  private pagosSeleccionados(): PagoVentaNuevo[] | 'incompleto' | 'no-cuadra' | 'sin-cliente' {
    const total = this.total();
    if (this.metodoPago === 'efectivo') return [{ metodo: 'efectivo', monto: total }];
    if (this.metodoPago === 'transferencia') return [{ metodo: 'transferencia', monto: total }];
    if (this.metodoPago === 'credito') return [{ metodo: 'credito', monto: total }];
    const partes: PagoVentaNuevo[] = [];
    const efectivo = Number(this.montoEfectivo) || 0;
    const transferencia = Number(this.montoTransferencia) || 0;
    const credito = Number(this.montoCredito) || 0;
    if (efectivo > 0) partes.push({ metodo: 'efectivo', monto: efectivo });
    if (transferencia > 0) partes.push({ metodo: 'transferencia', monto: transferencia });
    if (credito > 0) partes.push({ metodo: 'credito', monto: credito });
    if (partes.length < 2) return 'incompleto';
    if (credito > 0 && !this.clienteId) return 'sin-cliente';
    if (Math.abs(partes.reduce((suma, p) => suma + p.monto, 0) - total) > 0.01) return 'no-cuadra';
    return partes;
  }

  /** Diferencia entre el total y lo cubierto por el pago mixto (para la pista). */
  restanteMixto(): number {
    return Math.round(
      this.total() -
        (Number(this.montoEfectivo) || 0) -
        (Number(this.montoTransferencia) || 0) -
        (Number(this.montoCredito) || 0),
    );
  }

  readonly ventasPorFecha = computed(() => {
    const mapa = new Map<string, Venta[]>();
    for (const venta of this.ventasFiltradas()) {
      const fecha = venta.created_at?.slice(0, 10) ?? '';
      const lista = mapa.get(fecha) ?? [];
      lista.push(venta);
      mapa.set(fecha, lista);
    }
    return Array.from(mapa, ([fecha, ventas]) => ({ fecha, ventas }));
  });

  readonly fechaFiltro = signal<string | null>(null);
  readonly usuarios = signal<Usuario[]>([]);
  readonly usuarioFiltro = signal<number | null>(null);

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  readonly ventasFiltradas = computed(() => {
    const filtro = this.fechaFiltro();
    const usuario = this.usuarioFiltro();
    return this.ventas().filter(
      (v) =>
        (!filtro || (v.created_at?.slice(0, 10) ?? '') === filtro) &&
        (usuario == null || v.usuario_id === usuario),
    );
  });

  async guardar(): Promise<void> {
    const pagos = this.pagosSeleccionados();
    if (pagos === 'incompleto') {
      await this.toast.advertencia('En el pago mixto usa al menos dos métodos con montos mayores a cero');
      return;
    }
    if (pagos === 'sin-cliente') {
      await this.toast.advertencia('Selecciona el cliente para la parte a crédito');
      return;
    }
    if (pagos === 'no-cuadra') {
      await this.toast.error('La suma de los montos debe ser igual al total');
      return;
    }
    const lineas = this.lineas();
    if (!lineas.length) {
      await this.toast.advertencia('Agrega al menos un producto');
      return;
    }
    const editando = this.ventaEditando();
    const devuelto = this.unidadesOriginales();
    for (const [i, linea] of lineas.entries()) {
      const producto = this.productos().find((p) => p.id === linea.producto_id);
      if (!producto) {
        await this.toast.advertencia(`Selecciona el producto de la línea ${i + 1}`);
        return;
      }
      if (!linea.cantidad) {
        await this.toast.advertencia(`Ingresa la cantidad de la línea ${i + 1}`);
        return;
      }
      const unidades = this.unidadesDe(linea);
      // Al editar, las unidades de la venta original vuelven al stock antes de re-aplicar
      const disponible = producto.stock + (editando ? (devuelto.get(linea.producto_id!) ?? 0) : 0);
      if (unidades > disponible) {
        await this.toast.error(
          `Stock insuficiente de "${producto.nombre}": disponible ${disponible} unidad(es)`,
        );
        return;
      }
      if (this.precioLinea(linea) <= 0) {
        await this.toast.error(`El producto "${producto.nombre}" no tiene valor de venta definido`);
        return;
      }
    }
    try {
      console.log('[ventas-debug] guardar: enviando nota =', JSON.stringify(this.nota), '| metodo =', this.metodoPago, '| editando =', !!editando);
      const lineasConPrecio = lineas.map((l) => ({
        ...l,
        factor: this.factorDe(l),
        precio_unitario: this.precioLinea(l),
        presentacion_nombre: l.presentacion_id ? this.nombrePresentacion(l) : undefined,
      }));
      const esCredito = this.metodoPago === 'credito';
      if (editando) {
        await this.ventaService.editar(
          editando.id!,
          lineasConPrecio,
          pagos as PagoVentaNuevo[],
          this.clienteId,
          this.nota,
        );
      } else {
        await this.ventaService.crear(
          lineasConPrecio,
          pagos as PagoVentaNuevo[],
          this.nota,
          this.clienteId,
        );
      }
      this.modalAbierto.set(false);
      this.ventaEditando.set(null);
      this.unidadesOriginales.set(new Map());
      await this.cargar();
      await this.toast.exito(
        editando ? 'Venta actualizada' : (esCredito ? 'Venta a crédito registrada' : 'Venta registrada'),
      );
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo registrar la venta');
    }
  }

  // ===== Vista previa / impresión del recibo =====

  async abrirRecibo(v: Venta, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    console.log('[ventas-debug] abrirRecibo: venta', v.id, '| nota =', JSON.stringify(v.nota));
    this.ventaRecibo.set(v);
    this.detallesRecibo.set(await this.ventaService.detalle(v.id!));
    this.pagosRecibo.set(await this.ventaService.pagos(v.id!));
    const cuenta = await this.sqlite.getCuentaCobrarPorVenta(v.id!);
    const cliente = cuenta
      ? this.clientes().find((c) => c.id === cuenta.cliente_id)
      : undefined;
    this.clienteRecibo.set(cliente?.nombre ?? null);
    this.creditoRecibo.set(v.metodo_pago === 'mixto' ? (cuenta?.total ?? 0) : 0);
    this.reciboAbierto.set(true);
  }

  /** Envía el recibo a la impresora térmica Bluetooth; si no hay elegida, pide seleccionarla. */
  async imprimirRecibo(): Promise<void> {
    const venta = this.ventaRecibo();
    if (!venta) return;
    const datos = this.datosRecibo(venta);
    const resultado = await this.impresora.imprimir(datos);
    if (resultado === 'sin-impresora') {
      await this.elegirImpresora(datos);
      return;
    }
    await this.toast.exito('Recibo enviado a la impresora');
  }

  /** Diálogo para elegir la impresora entre las emparejadas y luego imprimir. */
  private async elegirImpresora(datos: DatosRecibo): Promise<void> {
    const impresoras = await this.impresora.listarImpresoras();
    if (!impresoras.length) {
      await this.toast.advertencia('No hay impresoras Bluetooth emparejadas; emparejala en Ajustes');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Selecciona la impresora',
      inputs: impresoras.map((p, i) => ({
        type: 'radio' as const,
        label: p.name,
        value: i,
        checked: i === 0,
      })),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Imprimir',
          handler: async (indice: number) => {
            const elegida = await this.impresora.seleccionarImpresora(indice);
            if (!elegida) return;
            try {
              await this.impresora.enviar(elegida, datos);
              await this.toast.exito('Recibo enviado a la impresora');
            } catch (err) {
              await this.toast.error(
                err instanceof Error ? err.message : 'No se pudo imprimir el recibo',
              );
            }
          },
        },
      ],
    });
    await alert.present();
  }

  /** Traduce la venta y su detalle al formato que espera el encoder ESC/POS. */
  private datosRecibo(venta: Venta): DatosRecibo {
    const lineas = this.detallesRecibo().map((d) => {
      const factor = d.presentacion_factor ?? 1;
      const precioUnidad = factor > 1 ? d.precio_unitario / factor : d.precio_unitario;
      return {
        nombre: d.producto_nombre ?? '',
        cantidad: `${formatoEnteroEsCo(d.cantidad)} ${d.presentacion_nombre ?? 'u'}`,
        precio: formatoValorEsCo(precioUnidad),
        subtotal: formatoValorEsCo(d.cantidad * precioUnidad),
      };
    });
    const metodoDetalle: string[] = [];
    if (venta.metodo_pago === 'mixto') {
      for (const p of this.pagosRecibo()) {
        metodoDetalle.push(
          `${p.metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'}: ${formatoValorEsCo(p.monto)}`,
        );
      }
    } else if (!venta.metodo_pago && this.clienteRecibo()) {
      metodoDetalle.push(`Cliente: ${this.clienteRecibo()}`);
    }
    return {
      ventaId: venta.id,
      fecha: this.fechaRecibo(venta),
      lineas,
      total: formatoValorEsCo(venta.total),
      metodo: this.metodoLabel(venta),
      metodoDetalle: metodoDetalle,
      nota: venta.nota,
    };
  }

  private fechaRecibo(venta: Venta): string {
    const cruda = venta.created_at ?? '';
    const [fecha, hora] = cruda.split(' ');
    if (!fecha) return cruda;
    const [a, m, d] = fecha.split('-');
    return `${d}/${m}/${a}${hora ? ' ' + hora.slice(0, 5) : ''}`;
  }

  async confirmarEliminar(v: Venta, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar ventas');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar venta',
      message:
        `¿Seguro que deseas eliminar la venta por ${v.total.toFixed(2)}? ` +
        'El inventario se restablecerá (las unidades vuelven a sus lotes) y se anulará la cuenta por cobrar si era a crédito.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminar(v) },
      ],
    });
    await alert.present();
  }

  private async eliminar(v: Venta): Promise<void> {
    try {
      await this.ventaService.eliminar(v.id!);
      await this.cargar();
      await this.toast.exito('Venta eliminada; inventario restablecido');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la venta');
    }
  }

  // ===== Gestión de clientes (editar / eliminar) =====

  abrirGestionClientes(): void {
    this.selectorClientesAbierto.set(true);
  }

  async editarCliente(id: number): Promise<void> {
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede editar clientes');
      return;
    }
    const cliente = this.clientes().find((c) => c.id === id);
    if (!cliente) return;
    const alert = await this.alertCtrl.create({
      header: 'Editar cliente',
      inputs: [{ name: 'nombre', type: 'text', value: cliente.nombre, placeholder: 'Nombre del cliente' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (datos) => {
            const nombre = datos.nombre?.trim();
            if (!nombre) {
              await this.toast.advertencia('El nombre del cliente es obligatorio');
              return false;
            }
            try {
              await this.clienteService.actualizar({ id, nombre });
              this.clientes.set(await this.clienteService.listar());
              await this.toast.exito('Cliente actualizado');
              return true;
            } catch {
              await this.toast.error('No se pudo actualizar el cliente (¿nombre repetido?)');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarEliminarCliente(id: number): Promise<void> {
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar clientes');
      return;
    }
    const cliente = this.clientes().find((c) => c.id === id);
    if (!cliente) return;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar cliente',
      message: `¿Seguro que deseas eliminar a "${cliente.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarCliente(id) },
      ],
    });
    await alert.present();
  }

  private async eliminarCliente(id: number): Promise<void> {
    const ok = await this.clienteService.eliminar(id);
    this.clientes.set(await this.clienteService.listar());
    if (ok) {
      if (this.clienteId === id) this.clienteId = undefined;
      await this.toast.exito('Cliente eliminado');
    } else {
      await this.toast.error('No se puede eliminar: el cliente tiene cuentas por cobrar relacionadas.');
    }
  }
}
