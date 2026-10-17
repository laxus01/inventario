import { Injectable, inject } from '@angular/core';
import { BaseCaja } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class BasesService {
  private readonly sqlite = inject(SqliteService);

  crear(fecha: string, baseEfectivo: number, baseCuenta: number): Promise<number> {
    return this.sqlite.addBase({
      fecha,
      base_efectivo: baseEfectivo,
      base_cuenta: baseCuenta,
    });
  }

  listar(fecha?: string | null, usuarioId?: number | null): Promise<BaseCaja[]> {
    return this.sqlite.getBases(fecha, usuarioId);
  }

  /** Base total del día (suma si hay varios registros): efectivo y cuenta. */
  porFecha(fecha: string, usuarioId?: number | null): Promise<{ efectivo: number; cuenta: number }> {
    return this.sqlite.getBasePorFecha(fecha, usuarioId);
  }

  eliminar(baseId: number): Promise<void> {
    return this.sqlite.eliminarBase(baseId);
  }
}
