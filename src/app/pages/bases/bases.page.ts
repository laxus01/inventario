import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { BaseCaja, Usuario } from '../../models/inventario.models';
import { BasesService } from '../../core/services/bases.service';
import { AuthService } from '../../core/services/auth.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { agruparPorFecha, etiquetaFecha, fechaLocalIso, hoyIso } from '../../core/utils/fechas';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { InputValorComponent } from '../../shared/components/input-valor/input-valor.component';
import { FormatoValorPipe } from '../../shared/pipes/formato-valor.pipe';
import { FiltroFechaComponent } from '../../shared/components/filtro-fecha/filtro-fecha.component';

@Component({
  selector: 'app-bases',
  templateUrl: './bases.page.html',
  styleUrls: ['./bases.page.scss'],
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
    IonItem,
    IonLabel,
    IonList,
    IonDatetime,
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
export class BasesPage {
  private readonly basesService = inject(BasesService);
  private readonly auth = inject(AuthService);
  private readonly sqlite = inject(SqliteService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly bases = signal<BaseCaja[]>([]);
  readonly usuarios = signal<Usuario[]>([]);
  readonly fechaFiltro = signal<string | null>(null);
  readonly usuarioFiltro = signal<number | null>(null);
  readonly cargando = signal(true);
  readonly modalAbierto = signal(false);
  readonly calendarioAbierto = signal(false);
  /** Solo el administrador puede eliminar bases registradas. */
  readonly esAdmin = signal(false);

  readonly hoyIso = hoyIso;
  readonly fechaLocalIso = fechaLocalIso;

  readonly basesFiltradas = computed(() => {
    const filtro = this.fechaFiltro();
    const usuario = this.usuarioFiltro();
    return this.bases().filter(
      (b) =>
        (!filtro || b.fecha === filtro) &&
        (usuario == null || b.usuario_id === usuario),
    );
  });

  readonly basesPorFecha = computed(() =>
    agruparPorFecha(this.basesFiltradas(), (b) => b.fecha),
  );

  readonly totalEfectivo = computed(() =>
    this.basesFiltradas().reduce((suma, b) => suma + b.base_efectivo, 0),
  );

  readonly totalCuenta = computed(() =>
    this.basesFiltradas().reduce((suma, b) => suma + b.base_cuenta, 0),
  );

  nuevaFecha = hoyIso();
  nuevaEfectivo: number | undefined;
  nuevaCuenta: number | undefined;

  async ionViewWillEnter(): Promise<void> {
    this.esAdmin.set(await this.auth.esAdmin());
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.bases.set(await this.basesService.listar());
      this.usuarios.set(await this.sqlite.getUsuarios());
    } finally {
      this.cargando.set(false);
    }
  }

  etiquetaFecha(fecha: string): string {
    return etiquetaFecha(fecha);
  }

  abrirNuevaBase(): void {
    this.nuevaFecha = this.fechaFiltro() ?? hoyIso();
    this.nuevaEfectivo = undefined;
    this.nuevaCuenta = undefined;
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  abrirCalendario(): void {
    this.calendarioAbierto.set(true);
  }

  cerrarCalendario(): void {
    this.calendarioAbierto.set(false);
  }

  aplicarFecha(): void {
    const valor = this.nuevaFecha.slice(0, 10);
    this.nuevaFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoyIso();
    this.calendarioAbierto.set(false);
  }

  async guardarBase(): Promise<void> {
    const efectivo = Number(this.nuevaEfectivo) || 0;
    const cuenta = Number(this.nuevaCuenta) || 0;
    if (efectivo <= 0 && cuenta <= 0) {
      await this.toast.advertencia('Ingresa al menos una base mayor que cero');
      return;
    }
    try {
      await this.basesService.crear(this.nuevaFecha, efectivo, cuenta);
      this.modalAbierto.set(false);
      await this.cargar();
      await this.toast.exito('Base registrada');
    } catch {
      await this.toast.error('No se pudo registrar la base');
    }
  }

  async confirmarEliminarBase(base: BaseCaja): Promise<void> {
    if (!this.esAdmin()) {
      await this.toast.advertencia('Solo el administrador puede eliminar bases');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar base',
      message:
        `¿Seguro que deseas eliminar la base del ${etiquetaFecha(base.fecha)}? ` +
        'Los reportes dejarán de contarla.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarBase(base) },
      ],
    });
    await alert.present();
  }

  private async eliminarBase(base: BaseCaja): Promise<void> {
    try {
      await this.basesService.eliminar(base.id!);
      await this.cargar();
      await this.toast.exito('Base eliminada');
    } catch {
      await this.toast.error('No se pudo eliminar la base');
    }
  }
}
