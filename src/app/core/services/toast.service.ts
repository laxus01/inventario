import { Injectable, inject } from '@angular/core';
import { ToastController } from '@ionic/angular';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly toastCtrl = inject(ToastController);

  async mostrar(mensaje: string, color: string = 'dark'): Promise<void> {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      color,
      duration: 2200,
      position: 'bottom',
    });
    await toast.present();
  }

  exito(mensaje: string): Promise<void> {
    return this.mostrar(mensaje, 'success');
  }

  error(mensaje: string): Promise<void> {
    return this.mostrar(mensaje, 'danger');
  }

  advertencia(mensaje: string): Promise<void> {
    return this.mostrar(mensaje, 'warning');
  }
}
