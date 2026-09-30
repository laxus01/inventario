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
import { AbonoCobrar, CuentaCobrar, Usuario } from '../../models/inventario.models';
import { CuentasCobrarService } from '../../core/services/cuentas-cobrar.service';
import { AuthService } from '../../core/services/auth.service';
import { ClienteService } from '../../core/services/cliente.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { agruparPorFecha, etiquetaFecha } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

@Component({
  selector: 'app-cuentas-por-cobrar',
  templateUrl: './cuentas-por-cobrar.page.html',
  styleUrls: ['./cuentas-por-cobrar.page.scss'],
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
    IonSelect,
    IonSelectOption,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonModal,
    IonFab,
    IonFabButton,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
    InputValorComponent,
    FiltroFechaComponent,
  ],
})
export class CuentasPorCobrarPage {
  private readonly cuentasCobrarService = inject(CuentasCobrarService);
  private readonly auth = inject(AuthService);
  private readonly clienteService = inject(ClienteService);
  private readonly sqlite = inject(SqliteService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly cuentas = signal<CuentaCobrar[]>([]);
  readonly abonos = signal<Record<number, AbonoCobrar[]>>({});
  readonly clientes = signal<{ id?: number; nombre: string }[]>([]);
  readonly fechaFiltro = signal<string | null>(null);
  readonly usuarios = signal<Usuario[]>([]);
  readonly usuarioFiltro = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  readonly modalCuentaAbierta = signal(false);
  /** Solo el administrador puede eliminar cuentas o abonos. */
  readonly esAdmin = signal(false);

  readonly cuentasFiltradas = computed(() => {
    const filtro = this.fechaFiltro();
    const usuario = this.usuarioFiltro();
    return this.cuentas().filter(
      (c) =>
        (!filtro || (c.created_at?.slice(0, 10) ?? '') === filtro) &&
        (usuario == null || c.usuario_id === usuario),
    );
  });

  readonly totalPorCobrar = computed(() =>
    this.cuentasFiltradas().reduce((suma, c) => suma + this.saldo(c), 0),
  );

  readonly cuentasPorFecha = computed(() =>
    agruparPorFecha(this.cuentasFiltradas(), (c) => c.created_at?.slice(0, 10)),
  );

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  abonoCuenta: CuentaCobrar | null = null;
  valorAbono: number | undefined;

  nuevaClienteId: number | undefined;
  nuevaConcepto = '';
  nuevaValor: number | undefined;

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const cuentas = await this.cuentasCobrarService.listar();
      this.cuentas.set(cuentas);
      this.clientes.set(await this.clienteService.listar());
      this.usuarios.set(await this.sqlite.getUsuarios());
    } finally {
      this.cargando.set(false);
    }
  }

  saldo(cuenta: CuentaCobrar): number {
    return this.cuentasCobrarService.saldo(cuenta);
  }

  async alAbrir(cuenta: CuentaCobrar): Promise<void> {
    const abonos = await this.cuentasCobrarService.abonos(cuenta.id!);
    this.abonos.update((mapa) => ({ ...mapa, [cuenta.id!]: abonos }));
  }

  abrirAbono(cuenta: CuentaCobrar, ev: Event): void {
    ev.stopPropagation();
    this.abonoCuenta = cuenta;
    this.valorAbono = undefined;
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  abrirNuevaCuenta(): void {
    this.nuevaClienteId = undefined;
    this.nuevaConcepto = '';
    this.nuevaValor = undefined;
    this.modalCuentaAbierta.set(true);
  }

  cerrarModalCuenta(): void {
    this.modalCuentaAbierta.set(false);
  }

  seleccionarCliente(ev: CustomEvent): void {
    this.nuevaClienteId = (ev.detail as { value?: number }).value;
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
      this.nuevaClienteId = id;
      await this.toast.exito('Cliente agregado');
      return true;
    } catch {
      await this.toast.error('No se pudo crear el cliente (¿nombre repetido?)');
      return false;
    }
  }

  async guardarCuenta(): Promise<void> {
    if (!this.nuevaClienteId) {
      await this.toast.advertencia('Selecciona un cliente');
      return;
    }
    const valor = Number(this.nuevaValor) || 0;
    if (valor <= 0) {
      await this.toast.advertencia('Ingresa el valor de la cuenta');
      return;
    }
    try {
      await this.cuentasCobrarService.crear(
        0,
        this.nuevaClienteId,
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

  async guardarAbono(): Promise<void> {
    const cuenta = this.abonoCuenta;
    if (!cuenta) return;
    const valor = Number(this.valorAbono) || 0;
    const saldoAntes = this.saldo(cuenta);
    try {
      await this.cuentasCobrarService.abonar(cuenta, valor);
      this.modalAbierto.set(false);
      await this.cargar();
      await this.toast.exito(valor >= saldoAntes ? 'Cuenta pagada' : 'Abono registrado');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo registrar el abono');
    }
  }

  async confirmarEliminarCuenta(c: CuentaCobrar, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar cuentas');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar cuenta',
      message:
        `¿Seguro que deseas eliminar la cuenta de "${c.cliente_nombre}" por ${c.total.toFixed(2)}?` +
        (c.venta_id ? ' La venta asociada no se modifica.' : ''),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarCuenta(c) },
      ],
    });
    await alert.present();
  }

  private async eliminarCuenta(c: CuentaCobrar): Promise<void> {
    try {
      await this.cuentasCobrarService.eliminarCuenta(c);
      await this.cargar();
      await this.toast.exito('Cuenta eliminada');
    } catch (err) {
      await this.toast.error(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta');
    }
  }

  async confirmarEliminarAbono(c: CuentaCobrar, abono: AbonoCobrar, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar abonos');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar abono',
      message: `¿Seguro que deseas eliminar el abono de ${abono.valor.toFixed(2)}? El saldo de la cuenta volverá a aumentar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarAbono(c, abono) },
      ],
    });
    await alert.present();
  }

  private async eliminarAbono(c: CuentaCobrar, abono: AbonoCobrar): Promise<void> {
    try {
      await this.cuentasCobrarService.eliminarAbono(abono.id!);
      await this.cargar();
      await this.alAbrir(c);
      await this.toast.exito('Abono eliminado');
    } catch {
      await this.toast.error('No se pudo eliminar el abono');
    }
  }
}
