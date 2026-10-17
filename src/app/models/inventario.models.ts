export interface Categoria {
  id?: number;
  nombre: string;
  descripcion?: string | null;
}

export interface Producto {
  id?: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  categoria_id?: number | null;
  categoria_nombre?: string | null;
  unidad: string;
  precio_compra: number;
  precio_venta: number;
  stock: number;
  stock_minimo: number;
  activo: number;
  costo_actual?: number | null;
}

export interface Lote {
  id?: number;
  producto_id: number;
  cantidad_inicial: number;
  cantidad_restante: number;
  costo_unitario: number;
}

export interface Proveedor {
  id?: number;
  nombre: string;
  contacto?: string | null;
}

export interface Compra {
  id?: number;
  proveedor_id: number;
  proveedor_nombre?: string;
  total: number;
  usuario_id?: number | null;
  created_at?: string;
}

export interface CompraDetalle {
  id?: number;
  compra_id: number;
  producto_id: number;
  producto_nombre?: string;
  /** Lote creado por esta línea; permite revertir el inventario al eliminar/editar. */
  lote_id?: number | null;
  cantidad: number;
  costo_unitario: number;
}

export interface LineaCompra {
  producto_id?: number;
  cantidad?: number;
  costo_total?: number;
}

export type MetodoPago = 'efectivo' | 'transferencia';

/** Métodos que puede tener una parte de pago: los contado más el crédito. */
export type PartePagoMetodo = MetodoPago | 'credito';

/** Etiqueta del método de una venta: 'mixto' cuando combina varios pagos. */
export type MetodoPagoVenta = MetodoPago | 'mixto';

export interface Venta {
  id?: number;
  total: number;
  ganancia: number;
  metodo_pago?: MetodoPagoVenta | null;
  /** Nota libre opcional (referencia, observación, etc.) que sale en el recibo. */
  nota?: string | null;
  usuario_id?: number | null;
  created_at?: string;
}

/** Pago (o parte) con el que se cubre una venta; una venta mixta tiene varios. */
export interface PagoVenta {
  id?: number;
  venta_id: number;
  metodo: MetodoPago;
  monto: number;
}

export interface VentaDetalle {
  id?: number;
  venta_id: number;
  producto_id: number;
  producto_nombre?: string;
  lote_id: number;
  /** Unidades vendidas (consumo real del lote). */
  cantidad: number;
  /** Precio por presentación; para ventas por unidad es el precio unitario. */
  precio_unitario: number;
  costo_unitario: number;
  presentacion_nombre?: string | null;
  presentacion_factor?: number | null;
}

/** Presentación de venta de un producto (ej. Cava de 30, Media cava de 15). */
export interface Presentacion {
  id?: number;
  producto_id: number;
  nombre: string;
  /** Unidades que contiene la presentación (factor de conversión). */
  factor: number;
  /** Precio de venta de la presentación; si es null se calcula factor × precio unitario. */
  precio_venta?: number | null;
}

export interface LineaVenta {
  producto_id?: number;
  /** Cantidad de presentaciones (para unidad equivale a unidades). */
  cantidad?: number;
  /** Id de la presentación elegida; undefined = venta por unidad. */
  presentacion_id?: number;
  /** Nombre de la presentación (solo para el detalle guardado). */
  presentacion_nombre?: string;
  /** Unidades por presentación de la línea (1 para unidad). */
  factor?: number;
  /** Precio por presentación. */
  precio_unitario?: number;
}

export interface Cliente {
  id?: number;
  nombre: string;
}

export interface CuentaCobrar {
  id?: number;
  venta_id: number;
  cliente_id: number;
  cliente_nombre?: string;
  concepto?: string | null;
  total: number;
  abonado?: number;
  usuario_id?: number | null;
  created_at?: string;
}

export interface AbonoCobrar {
  id?: number;
  cuenta_id: number;
  valor: number;
  created_at?: string;
}

export interface CuentaPagar {
  id?: number;
  compra_id: number;
  proveedor_id: number;
  proveedor_nombre?: string;
  concepto?: string | null;
  total: number;
  abonado?: number;
  usuario_id?: number | null;
  created_at?: string;
}

export interface AbonoPagar {
  id?: number;
  cuenta_id: number;
  valor: number;
  created_at?: string;
}

/** Base de caja entregada para operar el día (vueltos): en efectivo y en cuenta. */
export interface BaseCaja {
  id?: number;
  fecha: string;
  base_efectivo: number;
  base_cuenta: number;
  usuario_nombre?: string | null;
  usuario_id?: number | null;
  created_at?: string;
}

export type TipoMovimiento = 'entrada' | 'salida' | 'ajuste';

export type RolUsuario = 'admin' | 'operador';

export interface Usuario {
  id?: number;
  usuario: string;
  nombre: string;
  clave_hash: string;
  rol?: RolUsuario;
  activo?: number;
}

export interface ProductoStockBajo {
  id: number;
  nombre: string;
  stock: number;
  stock_minimo: number;
}

export interface Movimiento {
  id?: number;
  producto_id: number;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo?: string | null;
  /** Lote creado o consumido por este movimiento (ajustes manuales). */
  lote_id?: number | null;
  created_at?: string;
}

/** Actividad de un usuario en un rango de fecha, agrupada por tipo. */
export interface ActividadUsuario {
  usuario_id: number | null;
  nombre: string;
  ventasCantidad: number;
  ventasTotal: number;
  ventasGanancia: number;
  comprasCantidad: number;
  comprasTotal: number;
  movimientos: number;
  productosCreados: number;
  clientesCreados: number;
  proveedoresCreados: number;
  categoriasCreadas: number;
  cuentasCobrar: number;
  abonosCantidad: number;
  abonosTotal: number;
  cuentasPagar: number;
  pagosCantidad: number;
  pagosTotal: number;
}
