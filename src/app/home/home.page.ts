import { Component, inject, signal } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonToolbar } from '@ionic/angular';
import { Router } from '@angular/router';
import { AppModule, MODULES } from '../core/constants/modules';
import { USER_NAME } from '../core/constants/app';
import { AuthService } from '../core/services/auth.service';
import { ModuleButtonComponent } from '../shared/components/module-button/module-button.component';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonContent, IonButtons, IonButton, IonIcon, ModuleButtonComponent],
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);

  readonly modules = signal<AppModule[]>(MODULES);
  readonly userName = signal(USER_NAME);

  async ionViewWillEnter(): Promise<void> {
    const usuario = await this.auth.usuarioActual();
    this.userName.set(usuario?.nombre ?? USER_NAME);
    // Usuarios y Reportes solo se muestran a administradores
    const esAdmin = usuario?.rol === 'admin';
    const soloAdmin = ['usuarios', 'reportes'];
    this.modules.set(MODULES.filter((m) => !soloAdmin.includes(m.id) || esAdmin));
  }

  async confirmarSalir(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: '¿Deseas cerrar la sesión actual?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Salir', role: 'destructive', handler: () => this.salir() },
      ],
    });
    await alert.present();
  }

  private async salir(): Promise<void> {
    await this.auth.cerrarSesion();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}
