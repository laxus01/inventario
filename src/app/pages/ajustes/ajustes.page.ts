import { Component, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { SyncService } from '../../core/services/sync.service';
import { ToastService } from '../../core/services/toast.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-ajustes',
  templateUrl: './ajustes.page.html',
  styleUrls: ['./ajustes.page.scss'],
  imports: [
    FormsModule,
    IonContent,
    IonButton,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    PageHeaderComponent,
  ],
})
export class AjustesPage {
  private readonly sqlite = inject(SqliteService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);
  private readonly router = inject(Router);
  private readonly sync = inject(SyncService);

  @ViewChild('servidorInput', { read: ElementRef }) servidorEl?: ElementRef<HTMLInputElement>;
  @ViewChild('tokenInput', { read: ElementRef }) tokenEl?: ElementRef<HTMLInputElement>;

  readonly urlServidor = signal('');
  readonly token = signal('');
  readonly ultimaSync = signal<string | null>(null);
  readonly sincronizando = signal(false);
  readonly esWeb = this.sqlite.esWeb();
  readonly cambioClaveAbierto = signal(false);
  readonly cambiandoClave = signal(false);
  /** Solo el administrador ve la sincronización y las opciones de datos. */
  readonly esAdmin = signal(false);

  claveActual = '';
  nuevaClave = '';
  confirmarClave = '';

  ionViewWillEnter(): void {
    void this.cargarEstado();
    void this.auth.esAdmin().then((admin) => this.esAdmin.set(admin));
  }

  private async cargarEstado(): Promise<void> {
    const estado = await this.sqlite.getSyncEstado();
    this.urlServidor.set(estado.servidor ?? '');
    this.token.set(estado.token ?? '');
    this.ultimaSync.set(estado.last_sync);
  }

  async guardarServidor(): Promise<void> {
    const valor = this.servidorEl?.nativeElement?.value ?? this.urlServidor();
    const url = String(valor).trim();
    this.urlServidor.set(url);
    const token = String(this.tokenEl?.nativeElement?.value ?? this.token()).trim();
    this.token.set(token);
    await this.sqlite.setSyncEstado({ servidor: url || null, token: token || null });
  }

  async sincronizarAhora(): Promise<void> {
    if (this.sincronizando()) return;
    this.sincronizando.set(true);
    try {
      await this.guardarServidor();
      if (!this.urlServidor()) {
        await this.toast.error('Escribe la dirección del servidor (ej. http://192.168.1.10:3000)');
        return;
      }
      const resultado = await this.sync.sincronizar();
      await this.toast.exito(
        `Sincronizado: ${resultado.enviados} enviados, ${resultado.recibidos} recibidos`,
      );
      await this.cargarEstado();
    } catch (error) {
      await this.toast.error(
        error instanceof Error ? error.message : 'No se pudo sincronizar',
      );
    } finally {
      this.sincronizando.set(false);
    }
  }

  toggleCambioClave(): void {
    this.cambioClaveAbierto.update((abierto) => !abierto);
    this.claveActual = '';
    this.nuevaClave = '';
    this.confirmarClave = '';
  }

  async guardarClave(): Promise<void> {
    if (!this.claveActual || !this.nuevaClave) {
      await this.toast.advertencia('Completa la contraseña actual y la nueva');
      return;
    }
    if (this.nuevaClave.length < 4) {
      await this.toast.advertencia('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (this.nuevaClave !== this.confirmarClave) {
      await this.toast.advertencia('La confirmación no coincide con la nueva contraseña');
      return;
    }
    this.cambiandoClave.set(true);
    try {
      const ok = await this.auth.cambiarClave(this.claveActual, this.nuevaClave);
      if (!ok) {
        await this.toast.error('La contraseña actual es incorrecta');
        return;
      }
      this.toggleFormularioClave();
      await this.toast.exito('Contraseña actualizada');
    } catch {
      await this.toast.error('No se pudo cambiar la contraseña');
    } finally {
      this.cambiandoClave.set(false);
    }
  }

  private toggleFormularioClave(): void {
    this.cambioClaveAbierto.set(false);
  }

  async confirmarRestablecimiento(): Promise<void> {    const alert = await this.alertCtrl.create({
      header: 'Restablecer aplicación',
      message:
        'Borra todos los datos locales de este navegador (incluidos los usuarios). Al arrancar de nuevo, la app se sincroniza y recupera todo desde el servidor.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Restablecer',
          role: 'destructive',
          handler: () => void this.restablecerAplicacion(),
        },
      ],
    });
    await alert.present();
  }

  private async restablecerAplicacion(): Promise<void> {
    await this.sqlite.restablecerAlmacenamiento();
    location.reload();
  }

  async confirmarEliminacion(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Eliminar registros de este dispositivo',
      message:
        'Se borrarán los productos, inventario, ventas, compras, clientes, proveedores y cuentas de ESTE dispositivo. La base de datos del servidor no se toca: al sincronizar de nuevo, todo se recupera desde allí.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Continuar',
          role: 'destructive',
          handler: () => this.segundaConfirmacion(),
        },
      ],
    });
    await alert.present();
  }

  private async segundaConfirmacion(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '¿Estás seguro?',
      message: 'Los datos locales se borrarán y se volverán a descargar del servidor en la próxima sincronización.',
      buttons: [
        { text: 'No, volver', role: 'cancel' },
        {
          text: 'Sí, limpiar',
          role: 'destructive',
          handler: () => this.eliminarTodo(),
        },
      ],
    });
    await alert.present();
  }

  private async eliminarTodo(): Promise<void> {
    try {
      await this.sqlite.reiniciarDatos();
      await this.auth.asegurarAdmin();
      await this.toast.exito('Datos locales eliminados. Sincroniza para recuperarlos del servidor.');
      this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch {
      await this.toast.error('No se pudieron eliminar los datos');
    }
  }

  async confirmarReenvio(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Reenviar todos los datos',
      message:
        'La próxima sincronización subirá al servidor TODO el contenido local de este dispositivo (productos, presentaciones, ventas, compras, cuentas...). Úsalo si el servidor quedó vacío o le faltan datos que este dispositivo conserva.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Reenviar',
          handler: () => void this.reenviarTodo(),
        },
      ],
    });
    await alert.present();
  }

  private async reenviarTodo(): Promise<void> {
    try {
      await this.sqlite.setSyncEstado({ last_push: null });
      await this.toast.exito(
        'Listo: presiona "Sincronizar ahora" para subir todo el contenido local al servidor',
      );
    } catch {
      await this.toast.error('No se pudo preparar el reenvío');
    }
  }
}
