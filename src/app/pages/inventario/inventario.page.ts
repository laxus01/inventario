import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { Lote, Movimiento, Producto, TipoMovimiento } from '../../models/inventario.models';
import { InventarioService } from '../../core/services/inventario.service';
import { AuthService } from '../../core/services/auth.service';
import { ProductoService } from '../../core/services/producto.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoEnteroPipe, FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';

@Component({
  selector: 'app-inventario',
  templateUrl: './inventario.page.html',
  styleUrls: ['./inventario.page.scss'],
  imports: [
    FormsModule,
    FormatoEnteroPipe,
    FormatoValorPipe,
    IonContent,
    IonHeader,
    IonIcon,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonInput,
    IonModal,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
  ],
})
export class InventarioPage {
  private readonly inventarioService = inject(InventarioService);
  private readonly auth = inject(AuthService);
  private readonly productoService = inject(ProductoService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly productos = signal<Producto[]>([]);
  readonly lotes = signal<Record<number, Lote[]>>({});
  readonly movimientos = signal<Record<number, Movimiento[]>>({});
  readonly valorTotal = signal(0);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  /** Solo el administrador puede ajustar el inventario o eliminar ajustes. */
  readonly esAdmin = signal(false);

  ajusteProducto: Producto | null = null;
  tipoAjuste: Exclude<TipoMovimiento, 'ajuste'> = 'entrada';
  cantidadAjuste: number | undefined;
  motivoAjuste = '';

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const productos = await this.productoService.listar();
      this.productos.set(productos);
      this.valorTotal.set(await this.inventarioService.valorTotal());
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarDetalle(producto: Producto): Promise<void> {
    const [lotes, movimientos] = await Promise.all([
      this.inventarioService.lotes(producto.id!),
      this.inventarioService.movimientos(producto.id!),
    ]);
    this.lotes.update((mapa) => ({ ...mapa, [producto.id!]: lotes }));
    this.movimientos.update((mapa) => ({
      ...mapa,
      [producto.id!]: movimientos.slice(0, 5),
    }));
  }

  async alAbrir(producto: Producto): Promise<void> {
    await this.cargarDetalle(producto);
  }

  stockBajo(p: Producto): boolean {
    return p.stock <= p.stock_minimo;
  }

  valorProducto(p: Producto): number {
    return (this.lotes()[p.id!] ?? []).reduce(
      (suma, l) => suma + l.cantidad_restante * l.costo_unitario,
      0,
    );
  }

  abrirAjuste(p: Producto, ev: Event): void {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      void this.toast.advertencia('Solo el administrador puede ajustar el inventario');
      return;
    }
    this.ajusteProducto = p;
    this.tipoAjuste = 'entrada';
    this.cantidadAjuste = undefined;
    this.motivoAjuste = '';
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  async guardarAjuste(): Promise<void> {
    const producto = this.ajusteProducto;
    if (!producto) return;
    try {
      await this.inventarioService.ajustar(
        producto.id!,
        this.tipoAjuste,
        Number(this.cantidadAjuste) || 0,
        this.motivoAjuste.trim() || undefined,
      );
      this.modalAbierto.set(false);
      await this.cargar();
      await this.toast.exito(
        this.tipoAjuste === 'entrada' ? 'Entrada registrada' : 'Salida registrada',
      );
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo registrar el ajuste');
    }
  }

  /** Solo los ajustes manuales se eliminan aquí; ventas/compras desde su módulo. */
  esAjuste(m: Movimiento): boolean {
    return this.inventarioService.esAjuste(m);
  }

  async confirmarEliminarAjuste(p: Producto, m: Movimiento, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar ajustes');
      return;
    }
    const esEntrada = m.tipo === 'entrada';
    const alert = await this.alertCtrl.create({
      header: 'Eliminar ajuste',
      message:
        `¿Seguro que deseas eliminar el ajuste de ${m.cantidad} unidad(es)? ` +
        (esEntrada
          ? 'El stock y el lote creado se reducirán.'
          : 'Las unidades volverán al lote del que salieron.'),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarAjuste(p, m) },
      ],
    });
    await alert.present();
  }

  private async eliminarAjuste(p: Producto, m: Movimiento): Promise<void> {
    try {
      await this.inventarioService.eliminarAjuste(m.id!);
      await this.cargar();
      await this.cargarDetalle(p);
      await this.toast.exito('Ajuste eliminado; inventario restablecido');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo eliminar el ajuste');
    }
  }
}
