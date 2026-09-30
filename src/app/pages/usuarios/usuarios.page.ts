import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from '@ionic/angular';
import { AuthService } from '../../core/services/auth.service';
import { SqliteService } from '../../core/services/sqlite.service';
import { ToastService } from '../../core/services/toast.service';
import { RolUsuario, Usuario } from '../../models/inventario.models';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-usuarios',
  templateUrl: './usuarios.page.html',
  styleUrls: ['./usuarios.page.scss'],
  imports: [
    FormsModule,
    IonContent,
    IonBadge,
    IonItem,
    IonInput,
    IonLabel,
    IonList,
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    PageHeaderComponent,
    EmptyStateComponent,
  ],
})
export class UsuariosPage {
  private readonly sqlite = inject(SqliteService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly alertCtrl = inject(AlertController);

  readonly usuarios = signal<Usuario[]>([]);
  readonly cargando = signal(true);
  readonly formularioAbierto = signal(false);
  readonly usuarioActualId = signal<number | null>(null);

  nuevoUsuario = '';
  nuevoNombre = '';
  nuevaClave = '';
  confirmarClave = '';
  mostrarClave = false;
  nuevoRol: RolUsuario = 'operador';
  guardando = false;

  toggleMostrarClave(): void {
    this.mostrarClave = !this.mostrarClave;
  }

  async ionViewWillEnter(): Promise<void> {
    await this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.usuarios.set(await this.sqlite.getUsuarios());
      this.usuarioActualId.set((await this.auth.usuarioActual())?.id ?? null);
    } finally {
      this.cargando.set(false);
    }
  }

  estaActivo(u: Usuario): boolean {
    return u.activo !== 0;
  }

  async cambiarEstado(u: Usuario): Promise<void> {
    if (u.id === this.usuarioActualId()) {
      await this.toast.advertencia('No puedes desactivar tu propio usuario');
      return;
    }
    const activando = !this.estaActivo(u);
    if (!activando && u.rol === 'admin' && (await this.sqlite.contarAdminsActivos()) <= 1) {
      await this.toast.advertencia('No puedes desactivar al último administrador activo');
      return;
    }
    await this.sqlite.setUsuarioActivo(u.id!, activando ? 1 : 0);
    await this.toast.exito(activando ? 'Usuario activado' : 'Usuario desactivado');
    await this.cargar();
  }

  async confirmarEliminar(u: Usuario): Promise<void> {
    if (u.id === this.usuarioActualId()) {
      await this.toast.advertencia('No puedes eliminar tu propio usuario');
      return;
    }
    if (!(await this.auth.esAdmin())) {
      await this.toast.advertencia('Solo un administrador puede eliminar usuarios');
      return;
    }
    const alert = await this.alertCtrl.create({
      header: 'Eliminar usuario',
      message: `¿Seguro que deseas eliminar a "${u.nombre}"? Si tiene registros relacionados, será desactivado en su lugar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminar(u) },
      ],
    });
    await alert.present();
  }

  private async eliminar(u: Usuario): Promise<void> {
    const resultado = await this.sqlite.eliminarUsuario(u.id!);
    if (resultado === 'eliminado') {
      await this.toast.exito('Usuario eliminado');
    } else {
      await this.toast.advertencia(
        'El usuario tiene registros relacionados y fue desactivado en su lugar',
      );
    }
    await this.cargar();
  }

  toggleFormulario(): void {
    this.formularioAbierto.update((abierto) => !abierto);
  }

  async crear(): Promise<void> {
    if (!this.nuevoUsuario.trim() || !this.nuevoNombre.trim() || !this.nuevaClave) {
      await this.toast.advertencia('Completa usuario, nombre y contraseña');
      return;
    }
    if (this.nuevaClave.length < 4) {
      await this.toast.advertencia('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    if (this.nuevaClave !== this.confirmarClave) {
      await this.toast.advertencia('Las contraseñas no coinciden');
      return;
    }
    this.guardando = true;
    try {
      await this.sqlite.addUsuario({
        usuario: this.nuevoUsuario.trim(),
        nombre: this.nuevoNombre.trim(),
        clave_hash: await this.auth.hashClave(this.nuevaClave),
        rol: this.nuevoRol,
      });
      this.nuevoUsuario = '';
      this.nuevoNombre = '';
      this.nuevaClave = '';
      this.confirmarClave = '';
      this.mostrarClave = false;
      this.nuevoRol = 'operador';
      this.formularioAbierto.set(false);
      await this.toast.exito('Usuario creado');
      await this.cargar();
    } catch {
      await this.toast.error('No se pudo crear: el nombre de usuario ya existe');
    } finally {
      this.guardando = false;
    }
  }
}
