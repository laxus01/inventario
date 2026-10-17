import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
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
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AbonoPagar, CuentaPagar, Usuario } from '../../models/inventario.models';
import { CuentasPagarService } from '../../core/services/cuentas-pagar.service';
import { AuthService } from '../../core/services/auth.service';
import { ProveedorService } from '../../core/services/proveedor.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { agruparPorFecha, etiquetaFecha, fechaLocalIso } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

@Component({
  selector: 'app-cuentas-por-pagar',
  templateUrl: './cuentas-por-pagar.page.html',
  styleUrls: ['./cuentas-por-pagar.page.scss'],
  imports: [
    FormsModule,
    FormatoValorPipe,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonInput,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonModal,
    IonSelect,
    IonSelectOption,
    IonFab,
    IonFabButton,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
    FiltroFechaComponent,
  ],
})
export class CuentasPorPagarPage {
  private readonly cuentasPagarService = inject(CuentasPagarService);
  private readonly auth = inject(AuthService);
  private readonly proveedorService = inject(ProveedorService);
  private readonly sqlite = inject(SqliteService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly cuentas = signal<CuentaPagar[]>([]);
  readonly fechaLocalIso = fechaLocalIso;
  readonly pagos = signal<Record<number, AbonoPagar[]>>({});
  readonly proveedores = signal<{ id?: number; nombre: string }[]>([]);
  readonly fechaFiltro = signal<string | null>(null);
  readonly usuarios = signal<Usuario[]>([]);
  readonly usuarioFiltro = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  readonly modalCuentaAbierta = signal(false);
  /** Solo el administrador puede eliminar cuentas o pagos. */
  readonly esAdmin = signal(false);

  readonly cuentasFiltradas = computed(() => {
    const filtro = this.fechaFiltro();
    const usuario = this.usuarioFiltro();
    return this.cuentas().filter(
      (c) =>
        (!filtro || fechaLocalIso(c.created_at) === filtro) &&
        (usuario == null || c.usuario_id === usuario),
    );
  });

  readonly totalPorPagar = computed(() =>
    this.cuentasFiltradas().reduce((suma, c) => suma + this.saldo(c), 0),
  );

  readonly cuentasPorFecha = computed(() =>
    agruparPorFecha(this.cuentasFiltradas(), (c) => fechaLocalIso(c.created_at)),
  );

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  pagoCuenta: CuentaPagar | null = null;
  valorPago: number | undefined;

  nuevaProveedorId: number | undefined;
  nuevaConcepto = '';
  nuevaValor: number | undefined;

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const cuentas = await this.cuentasPagarService.listar();
      this.cuentas.set(cuentas);
      this.proveedores.set(await this.proveedorService.listar());
      this.usuarios.set(await this.sqlite.getUsuarios());
    } finally {
      this.cargando.set(false);
    }
  }

  saldo(cuenta: CuentaPagar): number {
    return this.cuentasPagarService.saldo(cuenta);
  }

  async alAbrir(cuenta: CuentaPagar): Promise<void> {
    const pagos = await this.cuentasPagarService.pagos(cuenta.id!);
    this.pagos.update((mapa) => ({ ...mapa, [cuenta.id!]: pagos }));
  }

  abrirPago(cuenta: CuentaPagar, ev: Event): void {
    ev.stopPropagation();
    this.pagoCuenta = cuenta;
    this.valorPago = undefined;
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  abrirNuevaCuenta(): void {
    this.nuevaProveedorId = undefined;
    this.nuevaConcepto = '';
    this.nuevaValor = undefined;
    this.modalCuentaAbierta.set(true);
  }

  cerrarModalCuenta(): void {
    this.modalCuentaAbierta.set(false);
  }

  seleccionarProveedor(ev: CustomEvent): void {
    this.nuevaProveedorId = (ev.detail as { value?: number }).value;
  }

  async agregarProveedor(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Nuevo proveedor',
      inputs: [{ name: 'nombre', type: 'text', placeholder: 'Nombre del proveedor' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Guardar', handler: (datos) => this.crearProveedor(datos.nombre) },
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
      this.nuevaProveedorId = id;
      await this.toast.exito('Proveedor agregado');
      return true;
    } catch {
      await this.toast.error('No se pudo crear el proveedor (¿nombre repetido?)');
      return false;
    }
  }

  async guardarCuenta(): Promise<void> {
    if (!this.nuevaProveedorId) {
      await this.toast.advertencia('Selecciona un proveedor');
      return;
    }
    const valor = Number(this.nuevaValor) || 0;
    if (valor <= 0) {
      await this.toast.advertencia('Ingresa el valor de la cuenta');
      return;
    }
    try {
      await this.cuentasPagarService.crear(
        0,
        this.nuevaProveedorId,
        valor,
        this.nuevaConcepto.trim() || undefined,
      );
      this.modalCuentaAbierta.set(false);
      await this.cargar();
      await this.toast.exito('Cuenta registrada');
    } catch {
      await this.toast.error('No se pudo registrar la cuenta');
    }
  }

  async guardarPago(): Promise<void> {
    const cuenta = this.pagoCuenta;
    if (!cuenta) return;
    const valor = Number(this.valorPago) || 0;
    const saldoAntes = this.saldo(cuenta);
    try {
      await this.cuentasPagarService.pagar(cuenta, valor);
      this.modalAbierto.set(false);
      await this.cargar();
      await this.toast.exito(valor >= saldoAntes ? 'Cuenta pagada' : 'Pago registrado');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo registrar el pago');
    }
  }

  async confirmarEliminarCuenta(c: CuentaPagar, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar cuentas');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar cuenta',
      message:
        `¿Seguro que deseas eliminar la cuenta de "${c.proveedor_nombre}" por ${c.total.toFixed(2)}?` +
        (c.compra_id ? ' La compra asociada no se modifica.' : ''),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarCuenta(c) },
      ],
    });
    await alert.present();
  }

  private async eliminarCuenta(c: CuentaPagar): Promise<void> {
    try {
      await this.cuentasPagarService.eliminarCuenta(c);
      await this.cargar();
      await this.toast.exito('Cuenta eliminada');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta');
    }
  }

  async confirmarEliminarPago(c: CuentaPagar, pago: AbonoPagar, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar pagos');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar pago',
      message: `¿Seguro que deseas eliminar el pago de ${pago.valor.toFixed(2)}? El saldo de la cuenta volverá a aumentar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarPago(c, pago) },
      ],
    });
    await alert.present();
  }

  private async eliminarPago(c: CuentaPagar, pago: AbonoPagar): Promise<void> {
    try {
      await this.cuentasPagarService.eliminarPago(pago.id!);
      await this.cargar();
      await this.alAbrir(c);
      await this.toast.exito('Pago eliminado');
    } catch {
      await this.toast.error('No se pudo eliminar el pago');
    }
  }
}
