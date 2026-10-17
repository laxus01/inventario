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
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Compra, CompraDetalle, LineaCompra, Usuario } from '../../models/inventario.models';
import { AuthService } from '../../core/services/auth.service';
import { CompraService } from '../../core/services/compra.service';
import { ProveedorService } from '../../core/services/proveedor.service';
import { CuentasPagarService } from '../../core/services/cuentas-pagar.service';
import { ProductoService } from '../../core/services/producto.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { agruparPorFecha, etiquetaFecha, fechaLocalIso } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoEnteroPipe, FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';
import { OpcionSelector, SelectorModalComponent } from '../../shared/components/selector-modal/selector-modal.component';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

@Component({
  selector: 'app-compras',
  templateUrl: './compras.page.html',
  styleUrls: ['./compras.page.scss'],
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
    IonToggle,
    IonModal,
    IonFab,
    IonFabButton,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
    SelectorModalComponent,
    FiltroFechaComponent,
  ],
})
export class ComprasPage {
  private readonly compraService = inject(CompraService);
  private readonly auth = inject(AuthService);
  private readonly proveedorService = inject(ProveedorService);
  private readonly productoService = inject(ProductoService);
  private readonly cuentasPagarService = inject(CuentasPagarService);
  private readonly sqlite = inject(SqliteService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly compras = signal<Compra[]>([]);
  readonly fechaFiltro = signal<string | null>(null);
  readonly usuarios = signal<Usuario[]>([]);
  readonly usuarioFiltro = signal<number | null>(null);
  /** Solo el administrador puede editar o eliminar registros. */
  readonly esAdmin = signal(false);

  readonly comprasFiltradas = computed(() => {
    const filtro = this.fechaFiltro();
    const usuario = this.usuarioFiltro();
    return this.compras().filter(
      (c) =>
        (!filtro || fechaLocalIso(c.created_at) === filtro) &&
        (usuario == null || c.usuario_id === usuario),
    );
  });

  readonly comprasPorFecha = computed(() =>
    agruparPorFecha(this.comprasFiltradas(), (c) => fechaLocalIso(c.created_at)),
  );

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  readonly detalles = signal<Record<number, CompraDetalle[]>>({});
  readonly proveedores = signal<{ id?: number; nombre: string; contacto?: string | null }[]>([]);
  readonly productos = signal<{ id?: number; nombre: string; stock: number }[]>([]);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  readonly lineas = signal<LineaCompra[]>([]);
  /** Compra en edición (null = nueva compra). */
  readonly compraEditando = signal<Compra | null>(null);
  readonly selectorProveedoresAbierto = signal(false);

  proveedorId: number | undefined;
  esCredito = false;

  readonly selectorAbierto = signal(false);
  readonly selectorLinea = signal<number | null>(null);

  readonly opcionesProductos = computed<OpcionSelector[]>(() =>
    this.productos().map((p) => ({
      id: p.id!,
      nombre: p.nombre,
      detalle: `Stock: ${p.stock}`,
    })),
  );

  readonly opcionesProveedores = computed<OpcionSelector[]>(() =>
    this.proveedores().map((p) => ({ id: p.id!, nombre: p.nombre })),
  );

  readonly total = computed(() =>
    this.lineas().reduce((suma, l) => suma + (Number(l.costo_total) || 0), 0),
  );

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const compras = await this.compraService.listar();
      this.compras.set(compras);
      const mapa: Record<number, CompraDetalle[]> = {};
      for (const compra of compras) {
        mapa[compra.id!] = await this.compraService.detalle(compra.id!);
      }
      this.detalles.set(mapa);
      this.proveedores.set(await this.proveedorService.listar());
      this.productos.set(await this.productoService.listar());
      this.usuarios.set(await this.sqlite.getUsuarios());
    } finally {
      this.cargando.set(false);
    }
  }

  abrirNueva(): void {
    this.compraEditando.set(null);
    this.proveedorId = undefined;
    this.esCredito = false;
    this.lineas.set([{ }]);
    this.modalAbierto.set(true);
  }

  /** Reconstruye las líneas de la compra a partir de su detalle. */
  async abrirEditar(c: Compra, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede editar compras');
      return;
    }
    const detalles = await this.compraService.detalle(c.id!);
    if (!detalles.length) {
      await this.toast.advertencia('La compra no tiene productos registrados');
      return;
    }
    const cuenta = await this.sqlite.getCuentaPagarPorCompra(c.id!);
    this.compraEditando.set(c);
    this.lineas.set(
      detalles.map((d) => ({
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        costo_total: d.cantidad * d.costo_unitario,
      })),
    );
    this.proveedorId = c.proveedor_id;
    this.esCredito = !!cuenta;
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
    this.compraEditando.set(null);
  }

  agregarLinea(): void {
    this.lineas.update((lineas) => [...lineas, { }]);
  }

  quitarLinea(indice: number): void {
    this.lineas.update((lineas) => lineas.filter((_, i) => i !== indice));
  }

  actualizarLinea(indice: number, campo: 'cantidad' | 'costo_total', valor: number | undefined): void {
    this.lineas.update((lineas) =>
      lineas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)),
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
      lineas.map((l, i) => (i === indice ? { ...l, producto_id: id } : l)),
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

  seleccionarProveedor(ev: CustomEvent): void {
    this.proveedorId = (ev.detail as { value?: number }).value;
  }

  async agregarProveedor(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Nuevo proveedor',
      inputs: [
        { name: 'nombre', type: 'text', placeholder: 'Nombre del proveedor' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (datos) => this.crearProveedor(datos.nombre),
        },
      ],
    });
    await alert.present();
  }

  private async crearProveedor(nombre: string): Promise<boolean> {
    if (!nombre?.trim()) {
      await this.toast.advertencia('El nombre del proveedor es obligatorio');
      return false;
    }
    try {
      const id = await this.proveedorService.crear(nombre);
      this.proveedores.set(await this.proveedorService.listar());
      this.proveedorId = id;
      await this.toast.exito('Proveedor agregado');
      return true;
    } catch {
      await this.toast.error('No se pudo crear el proveedor (¿nombre repetido?)');
      return false;
    }
  }

  async guardar(): Promise<void> {
    if (!this.proveedorId) {
      await this.toast.advertencia('Selecciona un proveedor');
      return;
    }
    const lineas = this.lineas();
    if (!lineas.length) {
      await this.toast.advertencia('Agrega al menos un producto');
      return;
    }
    for (const [i, linea] of lineas.entries()) {
      if (!linea.producto_id || !linea.cantidad || linea.costo_total == null) {
        await this.toast.advertencia(`Completa la línea ${i + 1} (producto, cantidad y costo total)`);
        return;
      }
    }
    const editando = this.compraEditando();
    try {
      if (editando) {
        await this.compraService.editar(editando.id!, this.proveedorId, lineas, this.esCredito);
      } else {
        const compraId = await this.compraService.crear(this.proveedorId, lineas);
        if (this.esCredito) {
          await this.cuentasPagarService.crear(compraId, this.proveedorId, this.total());
        }
      }
      this.modalAbierto.set(false);
      this.compraEditando.set(null);
      await this.cargar();
      await this.toast.exito(
        editando
          ? 'Compra actualizada'
          : (this.esCredito ? 'Compra a crédito registrada' : 'Compra registrada'),
      );
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo registrar la compra');
    }
  }

  async confirmarEliminar(c: Compra, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar compras');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar compra',
      message:
        `¿Seguro que deseas eliminar la compra por ${c.total.toFixed(2)}? ` +
        'El inventario se restablecerá (se retiran las unidades que aportaron sus lotes) y se anulará la cuenta por pagar si era a crédito. ' +
        'Si alguna venta ya consumió unidades de esta compra, la eliminación será rechazada.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminar(c) },
      ],
    });
    await alert.present();
  }

  private async eliminar(c: Compra): Promise<void> {
    try {
      await this.compraService.eliminar(c.id!);
      await this.cargar();
      await this.toast.exito('Compra eliminada; inventario restablecido');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la compra');
    }
  }

  // ===== Gestión de proveedores (editar / eliminar) =====

  abrirGestionProveedores(): void {
    this.selectorProveedoresAbierto.set(true);
  }

  async editarProveedor(id: number): Promise<void> {
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede editar proveedores');
      return;
    }
    const proveedor = this.proveedores().find((p) => p.id === id);
    if (!proveedor) return;
    const alert = await this.alertCtrl.create({
      header: 'Editar proveedor',
      inputs: [
        { name: 'nombre', type: 'text', value: proveedor.nombre, placeholder: 'Nombre del proveedor' },
        { name: 'contacto', type: 'text', value: proveedor.contacto ?? '', placeholder: 'Contacto (opcional)' },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: async (datos) => {
            const nombre = datos.nombre?.trim();
            if (!nombre) {
              await this.toast.advertencia('El nombre del proveedor es obligatorio');
              return false;
            }
            try {
              await this.proveedorService.actualizar({
                id,
                nombre,
                contacto: datos.contacto?.trim() || null,
              });
              this.proveedores.set(await this.proveedorService.listar());
              await this.toast.exito('Proveedor actualizado');
              return true;
            } catch {
              await this.toast.error('No se pudo actualizar el proveedor (¿nombre repetido?)');
              return false;
            }
          },
        },
      ],
    });
    await alert.present();
  }

  async confirmarEliminarProveedor(id: number): Promise<void> {
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar proveedores');
      return;
    }
    const proveedor = this.proveedores().find((p) => p.id === id);
    if (!proveedor) return;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar proveedor',
      message: `¿Seguro que deseas eliminar a "${proveedor.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarProveedor(id) },
      ],
    });
    await alert.present();
  }

  private async eliminarProveedor(id: number): Promise<void> {
    const ok = await this.proveedorService.eliminar(id);
    this.proveedores.set(await this.proveedorService.listar());
    if (ok) {
      if (this.proveedorId === id) this.proveedorId = undefined;
      await this.toast.exito('Proveedor eliminado');
    } else {
      await this.toast.error('No se puede eliminar: el proveedor tiene compras o cuentas por pagar relacionadas.');
    }
  }
}
