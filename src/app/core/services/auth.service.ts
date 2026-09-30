import { Injectable, inject, signal } from '@angular/core';
import { Usuario } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sqlite = inject(SqliteService);
  private readonly usuarioSignal = signal<Usuario | null>(null);

  /**
   * Crea el usuario administrador por defecto (admin / admin) la primera vez
   * que se abre la aplicación. En instalaciones previas a los roles, promueve
   * al primer usuario existente a admin para que nadie quede sin acceso.
   */
  async asegurarAdmin(): Promise<void> {
    if ((await this.sqlite.contarUsuarios()) === 0) {
      await this.sqlite.addUsuario({
        usuario: 'admin',
        nombre: 'Administrador',
        clave_hash: await this.hashClave('admin'),
        rol: 'admin',
      });
      return;
    }
    await this.sqlite.promoverPrimerAdmin();
  }

  /** true si el usuario con sesión activa tiene rol de administrador. */
  async esAdmin(): Promise<boolean> {
    const actual = await this.usuarioActual();
    return actual?.rol === 'admin';
  }

  /**
   * Cambia la contraseña del usuario con sesión activa. Valida la contraseña
   * actual antes de aplicar el cambio; el nuevo hash se sincroniza con el
   * backend automáticamente.
   */
  async cambiarClave(claveActual: string, nueva: string): Promise<boolean> {
    const usuario = await this.usuarioActual();
    if (!usuario?.id) return false;
    const hashActual = await this.hashClave(claveActual);
    if (hashActual !== usuario.clave_hash) return false;
    await this.sqlite.cambiarClaveUsuario(usuario.id, await this.hashClave(nueva));
    return true;
  }

  async hashClave(clave: string): Promise<string> {
    const datos = new TextEncoder().encode(clave);
    const digest = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Valida las credenciales. Devuelve 'ok' si entra, 'inactivo' si el usuario
   * existe pero fue desactivado, o 'credenciales' si usuario/clave no coinciden.
   */
  async login(usuario: string, clave: string): Promise<'ok' | 'credenciales' | 'inactivo'> {
    const encontrado = await this.sqlite.getUsuarioPorLogin(usuario.trim());
    if (!encontrado) return 'credenciales';
    const hash = await this.hashClave(clave);
    if (encontrado.clave_hash !== hash) return 'credenciales';
    if (encontrado.activo === 0) return 'inactivo';
    await this.sqlite.setSesion(encontrado.id!);
    this.usuarioSignal.set(encontrado);
    return 'ok';
  }

  async usuarioActual(): Promise<Usuario | null> {
    const actual = this.usuarioSignal();
    if (actual) return actual;
    const deSesion = await this.sqlite.getUsuarioSesion();
    this.usuarioSignal.set(deSesion ?? null);
    return deSesion ?? null;
  }

  async cerrarSesion(): Promise<void> {
    await this.sqlite.limpiarSesion();
    this.usuarioSignal.set(null);
  }
}
