import { Injectable, inject } from '@angular/core';
import { Cliente } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class ClienteService {
  private readonly sqlite = inject(SqliteService);

  listar(): Promise<Cliente[]> {
    return this.sqlite.getClientes();
  }

  crear(nombre: string): Promise<number> {
    return this.sqlite.addCliente({ nombre: nombre.trim() });
  }

  actualizar(cliente: Cliente): Promise<void> {
    return this.sqlite.updateCliente({ ...cliente, nombre: cliente.nombre.trim() });
  }

  /**
   * Elimina el cliente solo si no tiene cuentas por cobrar relacionadas;
   * el borrado es lógico para que la sincronización lo propague.
   */
  async eliminar(id: number): Promise<boolean> {
    const cuentas = await this.sqlite.consultar<{ n: number }>(
      'SELECT COUNT(*) AS n FROM cuentas_cobrar WHERE cliente_id = ? AND deleted_at IS NULL',
      [id],
    );
    if ((cuentas[0]?.n ?? 0) > 0) return false;
    await this.sqlite.eliminarCliente(id);
    return true;
  }
}
