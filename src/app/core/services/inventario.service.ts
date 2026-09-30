import { Injectable, inject } from '@angular/core';
import { Lote, Movimiento, TipoMovimiento } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

/** Motivos que pertenecen a ventas/compras o a sus anulaciones: no se
 *  eliminan desde el módulo de inventario sino desde su propio módulo. */
const MOTIVO_AJENO = /^(Venta #|Compra #|Anulación )/;

@Injectable({ providedIn: 'root' })
export class InventarioService {
  private readonly sqlite = inject(SqliteService);

  lotes(productoId: number): Promise<Lote[]> {
    return this.sqlite.getLotes(productoId);
  }

  movimientos(productoId?: number): Promise<Movimiento[]> {
    return this.sqlite.getMovimientos(productoId);
  }

  valorTotal(): Promise<number> {
    return this.sqlite.getValorInventario();
  }

  /** true si el movimiento es un ajuste manual (no de venta/compra ni anulación). */
  esAjuste(mov: Movimiento): boolean {
    return !MOTIVO_AJENO.test(mov.motivo ?? '');
  }

  /**
   * Ajuste manual de inventario.
   * - Entrada: crea un lote con el costo actual del producto (o 0 si no tiene)
   *   y el movimiento queda enlazado a ese lote.
   * - Salida: consume lotes FIFO (del más antiguo al más reciente); genera un
   *   movimiento por lote consumido, cada uno enlazado a su lote.
   */
  async ajustar(
    productoId: number,
    tipo: Exclude<TipoMovimiento, 'ajuste'>,
    cantidad: number,
    motivo?: string,
  ): Promise<void> {
    if (!cantidad || cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor que cero');
    }
    const motivoFinal = motivo || (tipo === 'entrada' ? 'Ajuste de entrada' : 'Ajuste de salida');
    if (tipo === 'entrada') {
      const lotes = await this.sqlite.getLotes(productoId);
      const costoActual = lotes.length ? lotes[lotes.length - 1].costo_unitario : 0;
      const loteId = await this.sqlite.addLote({
        producto_id: productoId,
        cantidad_inicial: cantidad,
        cantidad_restante: cantidad,
        costo_unitario: costoActual,
      });
      await this.sqlite.addMovimiento({
        producto_id: productoId,
        tipo: 'entrada',
        cantidad,
        motivo: motivoFinal,
        lote_id: loteId,
      });
      return;
    }
    const consumos = await this.sqlite.consumirLotesFIFO(productoId, cantidad);
    for (const consumo of consumos) {
      await this.sqlite.addMovimiento({
        producto_id: productoId,
        tipo: 'salida',
        cantidad: consumo.cantidad,
        motivo: motivoFinal,
        lote_id: consumo.lote_id,
      });
    }
  }

  /**
   * Elimina un ajuste manual revirtiendo el inventario igual que se aplicó:
   * - Entrada: retira las unidades del lote que creó (deben seguir intactas).
   * - Salida: devuelve las unidades al lote del que salieron.
   * Registra el movimiento compensatorio y anula el ajuste (borrado lógico).
   */
  async eliminarAjuste(movimientoId: number): Promise<void> {
    const mov = await this.sqlite.getMovimiento(movimientoId);
    if (!mov) throw new Error('El movimiento no existe');
    if (MOTIVO_AJENO.test(mov.motivo ?? '')) {
      throw new Error('Este movimiento pertenece a una venta o compra; elimínalo desde su módulo');
    }
    if (!mov.lote_id) {
      throw new Error('No se puede revertir: ajuste anterior al modelo de lotes');
    }
    const lote = await this.sqlite.getLote(mov.lote_id);
    if (!lote) throw new Error('El lote del ajuste ya no existe');

    if (mov.tipo === 'entrada') {
      if (lote.cantidad_restante < mov.cantidad) {
        throw new Error(
          'No se puede revertir: hay ventas que consumieron unidades de este lote. Elimina primero las ventas relacionadas.',
        );
      }
      await this.sqlite.reducirLote(lote.id!, mov.cantidad);
      await this.sqlite.addMovimiento({
        producto_id: mov.producto_id,
        tipo: 'salida',
        cantidad: mov.cantidad,
        motivo: `Anulación Ajuste #${mov.id}`,
        lote_id: lote.id,
      });
    } else if (mov.tipo === 'salida') {
      await this.sqlite.restaurarLote(lote.id!, mov.cantidad);
      await this.sqlite.addMovimiento({
        producto_id: mov.producto_id,
        tipo: 'entrada',
        cantidad: mov.cantidad,
        motivo: `Anulación Ajuste #${mov.id}`,
        lote_id: lote.id,
      });
    } else {
      throw new Error('Solo se pueden eliminar ajustes de entrada o salida');
    }
    await this.sqlite.eliminarMovimiento(movimientoId);
  }
}
