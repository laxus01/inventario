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
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Producto, Presentacion } from '../../models/inventario.models';
import { AuthService } from '../../core/services/auth.service';
import { ProductoService } from '../../core/services/producto.service';
import { ToastService } from '../../core/services/toast.service';
import { formatoValorEsCo } from '../../shared/pipes/formato-valor.pipe';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';

@Component({
  selector: 'app-productos',
  templateUrl: './productos.page.html',
  styleUrls: ['./productos.page.scss'],
  imports: [
    FormsModule,
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
    IonInput,
    IonModal,
    IonFab,
    IonFabButton,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
    FormatoValorPipe,
  ],
})
export class ProductosPage {
  private readonly productoService = inject(ProductoService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly productos = signal<Producto[]>([]);
  readonly presentaciones = signal<Presentacion[]>([]);
  readonly todasPresentaciones = signal<Presentacion[]>([]);
  readonly cargando = signal(true);
  readonly busqueda = signal('');
  readonly modalAbierto = signal(false);
  readonly modalPresentacionAbierta = signal(false);
  /** Solo el administrador puede editar o eliminar registros. */
  readonly esAdmin = signal(false);

  form: Partial<Producto> = {};

  /** Presentación en edición en la modal (null = nueva). */
  presentacionEditando: Presentacion | null = null;
  presNombre = '';
  presFactor: number | undefined;
  presPrecio: number | undefined;

  /** Contador de ids temporales para presentaciones en borrador (modo creación). */
  private borradorId = -1;

  readonly filtrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    if (!q) return this.productos();
    return this.productos().filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q),
    );
  });

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const [productos, presentaciones] = await Promise.all([
        this.productoService.listar(),
        this.productoService.todasPresentaciones(),
      ]);
      this.productos.set(productos);
      this.todasPresentaciones.set(presentaciones);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Presentaciones registradas de un producto (para el detalle del acordeón). */
  presentacionesDe(productoId: number): Presentacion[] {
    return this.todasPresentaciones().filter((p) => p.producto_id === productoId);
  }

  /** Precio de la presentación: el guardado o el calculado (factor × precio unitario). */
  precioPresentacionDe(p: Presentacion, producto: Producto): string {
    const valor =
      p.precio_venta != null && p.precio_venta > 0
        ? p.precio_venta
        : (producto.precio_venta || 0) * p.factor;
    return `$ ${formatoValorEsCo(valor)}`;
  }

  private async refrescarPresentaciones(): Promise<void> {
    this.todasPresentaciones.set(await this.productoService.todasPresentaciones());
  }

  abrirNuevo(): void {
    this.form = { unidad: 'pza', stock: 0, stock_minimo: 0, activo: 1 };
    this.presentaciones.set([]);
    this.modalAbierto.set(true);
  }

  abrirEdicion(producto: Producto, ev: Event): void {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      void this.toast.advertencia('Solo el administrador puede editar productos');
      return;
    }
    this.form = { ...producto };
    void this.cargarPresentaciones(producto.id!);
    this.modalAbierto.set(true);
  }

  private async cargarPresentaciones(productoId: number): Promise<void> {
    this.presentaciones.set(await this.productoService.presentaciones(productoId));
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  precioPresentacion(p: Presentacion): string {
    const esProductoActual = p.producto_id === 0 || p.producto_id === this.form.id;
    const precioBase = esProductoActual
      ? Number(this.form.precio_venta) || 0
      : (this.productos().find((x) => x.id === p.producto_id)?.precio_venta ?? 0);
    if (p.precio_venta != null && p.precio_venta > 0) {
      return `$ ${p.precio_venta.toLocaleString('es-CO')}`;
    }
    const calculado = precioBase * p.factor;
    return `$ ${calculado.toLocaleString('es-CO')} (calculado)`;
  }

  agregarPresentacion(): void {
    this.presentacionEditando = null;
    this.presNombre = '';
    this.presFactor = undefined;
    this.presPrecio = undefined;
    this.modalPresentacionAbierta.set(true);
  }

  editarPresentacion(p: Presentacion, ev: Event): void {
    ev.stopPropagation();
    if (this.form.id && !this.esAdmin()) {
      void this.toast.advertencia('Solo el administrador puede editar presentaciones');
      return;
    }
    this.presentacionEditando = p;
    this.presNombre = p.nombre;
    this.presFactor = p.factor;
    this.presPrecio = p.precio_venta ?? undefined;
    this.modalPresentacionAbierta.set(true);
  }

  cerrarModalPresentacion(): void {
    this.modalPresentacionAbierta.set(false);
  }

  async guardarPresentacion(): Promise<void> {
    const nombre = this.presNombre.trim();
    const factor = Number(this.presFactor) || 0;
    if (!nombre || factor <= 0) {
      await this.toast.advertencia('El nombre y las unidades son obligatorios');
      return;
    }
    const precio = this.presPrecio ?? null;
    const existente = this.presentacionEditando;
    try {
      if (!this.form.id) {
        // Modo creación: se guarda en borrador y se persiste al guardar el producto.
        if (existente) {
          this.presentaciones.update((lista) =>
            lista.map((x) =>
              x.id === existente.id ? { ...x, nombre, factor, precio_venta: precio } : x,
            ),
          );
        } else {
          this.presentaciones.update((lista) => [
            ...lista,
            { id: this.borradorId--, producto_id: 0, nombre, factor, precio_venta: precio },
          ]);
        }
      } else if (existente) {
        await this.productoService.actualizarPresentacion({
          ...existente,
          nombre,
          factor,
          precio_venta: precio,
        });
        await this.refrescarPresentaciones();
        await this.cargarPresentaciones(this.form.id!);
      } else {
        await this.productoService.crearPresentacion({
          producto_id: this.form.id!,
          nombre,
          factor,
          precio_venta: precio,
        });
        await this.refrescarPresentaciones();
        await this.cargarPresentaciones(this.form.id!);
      }
      this.modalPresentacionAbierta.set(false);
      await this.toast.exito(existente ? 'Presentación actualizada' : 'Presentación agregada');
    } catch {
      await this.toast.error('No se pudo guardar (¿nombre repetido?)');
    }
  }

  async confirmarEliminarPresentacion(p: Presentacion, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (this.form.id && !this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar presentaciones');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar presentación',
      message: `¿Seguro que deseas eliminar la presentación "${p.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            if (!this.form.id) {
              this.presentaciones.update((lista) => lista.filter((x) => x.id !== p.id));
            } else {
              await this.productoService.eliminarPresentacion(p.id!);
              await this.refrescarPresentaciones();
              await this.cargarPresentaciones(p.producto_id);
            }
            await this.toast.exito('Presentación eliminada');
          },
        },
      ],
    });
    await alert.present();
  }

  async guardar(): Promise<void> {
    if (this.form.id && !this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede editar productos');
      return;
    }
    if (!this.form.nombre?.trim()) {
      await this.toast.advertencia('El nombre es obligatorio');
      return;
    }
    const datos = {
      ...this.form,
      precio_compra: Number(this.form.precio_compra) || 0,
      precio_venta: Number(this.form.precio_venta) || 0,
      stock: Number(this.form.stock) || 0,
      stock_minimo: Number(this.form.stock_minimo) || 0,
    } as Omit<Producto, 'id'>;
    try {
      if (this.form.id) {
        await this.productoService.actualizar({ ...datos, id: this.form.id });
      } else {
        const nuevoId = await this.productoService.crear(datos);
        for (const pr of this.presentaciones()) {
          await this.productoService.crearPresentacion({
            producto_id: nuevoId,
            nombre: pr.nombre,
            factor: pr.factor,
            precio_venta: pr.precio_venta ?? null,
          });
        }
      }
      this.modalAbierto.set(false);
      await this.cargar();
      await this.toast.exito('Producto guardado');
    } catch (err) {
      console.error('[productos] Error al guardar', err);
      await this.toast.error('No se pudo guardar. Verifica que el código no esté repetido.');
    }
  }

  async confirmarEliminar(producto: Producto, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar productos');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar producto',
      message: `¿Seguro que deseas eliminar "${producto.nombre}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.eliminar(producto),
        },
      ],
    });
    await alert.present();
  }

  private async eliminar(producto: Producto): Promise<void> {
    const ok = await this.productoService.eliminar(producto.id!);
    if (ok) {
      await this.cargar();
      await this.toast.exito('Producto eliminado');
    } else {
      await this.toast.error(
        'No se puede eliminar: el producto tiene compras o ventas activas (no anuladas).',
      );
    }
  }
}
