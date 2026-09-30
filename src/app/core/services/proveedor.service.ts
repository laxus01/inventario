import { Injectable, inject } from '@angular/core';
import { Proveedor } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class ProveedorService {
  private readonly sqlite = inject(SqliteService);

  listar(): Promise<Proveedor[]> {
    return this.sqlite.getProveedores();
  }

  crear(nombre: string): Promise<number> {
    return this.sqlite.addProveedor({ nombre: nombre.trim() });
  }

  actualizar(proveedor: Proveedor): Promise<void> {
    return this.sqlite.updateProveedor({ ...proveedor, nombre: proveedor.nombre.trim() });
  }

  /**
   * Elimina el proveedor solo si no tiene compras ni cuentas por pagar
   * relacionadas; el borrado es lógico para que la sincronización lo propague.
   */
  async eliminar(id: number): Promise<boolean> {
    const compras = await this.sqlite.consultar<{ n: number }>(
      'SELECT COUNT(*) AS n FROM compras WHERE proveedor_id = ? AND deleted_at IS NULL',
      [id],
    );
    const cuentas = await this.sqlite.consultar<{ n: number }>(
      'SELECT COUNT(*) AS n FROM cuentas_pagar WHERE proveedor_id = ? AND deleted_at IS NULL',
      [id],
    );
    if ((compras[0]?.n ?? 0) > 0 || (cuentas[0]?.n ?? 0) > 0) return false;
    await this.sqlite.eliminarProveedor(id);
    return true;
  }
}
