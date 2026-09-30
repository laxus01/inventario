import { Injectable, inject } from '@angular/core';
import { Presentacion, Producto } from '../../models/inventario.models';
import { SqliteService } from './sqlite.service';

@Injectable({ providedIn: 'root' })
export class ProductoService {
  private readonly sqlite = inject(SqliteService);

  listar(): Promise<Producto[]> {
    return this.sqlite.getProductos();
  }

  obtener(id: number): Promise<Producto | undefined> {
    return this.sqlite.getProducto(id);
  }

  presentaciones(productoId: number): Promise<Presentacion[]> {
    return this.sqlite.getPresentaciones(productoId);
  }

  todasPresentaciones(): Promise<Presentacion[]> {
    return this.sqlite.getPresentaciones();
  }

  crearPresentacion(p: Omit<Presentacion, 'id'>): Promise<number> {
    return this.sqlite.addPresentacion(p);
  }

  actualizarPresentacion(p: Presentacion): Promise<void> {
    return this.sqlite.updatePresentacion(p);
  }

  eliminarPresentacion(id: number): Promise<void> {
    return this.sqlite.deletePresentacion(id);
  }

  /**
   * Crea el producto sin stock: la cantidad inicial llega con la primera
   * compra, que genera el lote con su costo real (FIFO).
   */
  async crear(producto: Omit<Producto, 'id'>): Promise<number> {
    const codigo = producto.codigo?.trim() || (await this.sqlite.getNextProductoCodigo());
    return this.sqlite.addProducto({ ...producto, codigo, stock: 0 });
  }

  actualizar(producto: Producto): Promise<number> {
    return this.sqlite.updateProducto(producto);
  }

  /**
   * Elimina el producto solo si no tiene movimientos (compras, ventas
   * o ajustes) relacionados. Devuelve false si no es posible eliminarlo.
   */
  async eliminar(id: number): Promise<boolean> {
    const movimientos = await this.sqlite.getMovimientos(id);
    if (movimientos.length > 0) return false;
    await this.sqlite.deleteProducto(id);
    return true;
  }
}
