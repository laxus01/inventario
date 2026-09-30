import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
} from '@ionic/angular';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [FormsModule, IonContent, IonItem, IonInput, IonList, IonButton, IonIcon, AppIconComponent],
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  usuario = '';
  clave = '';
  mostrarClave = false;
  ingresando = false;

  toggleMostrarClave(): void {
    this.mostrarClave = !this.mostrarClave;
  }

  async ionViewWillEnter(): Promise<void> {
    if (await this.auth.usuarioActual()) {
      this.router.navigateByUrl('/home', { replaceUrl: true });
    }
  }

  async ingresar(): Promise<void> {
    if (!this.usuario.trim() || !this.clave) {
      await this.toast.advertencia('Ingresa usuario y contraseña');
      return;
    }
    this.ingresando = true;
    try {
      const resultado = await this.auth.login(this.usuario, this.clave);
      if (resultado === 'ok') {
        this.router.navigateByUrl('/home', { replaceUrl: true });
      } else if (resultado === 'inactivo') {
        await this.toast.error('Usuario inactivo. Contacta al administrador');
      } else {
        await this.toast.error('Usuario o contraseña incorrectos');
      }
    } finally {
      this.ingresando = false;
    }
  }
}
