import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import {
  AbonoCobrar,
  AbonoPagar,
  ActividadUsuario,
  Categoria,
  Cliente,
  Compra,
  CompraDetalle,
  CuentaCobrar,
  CuentaPagar,
  Lote,
  MetodoPago,
  MetodoPagoVenta,
  Movimiento,
  PagoVenta,
  Presentacion,
  Producto,
  ProductoStockBajo,
  Proveedor,
  Usuario,
  Venta,
  VentaDetalle,
} from '../../models/inventario.models';

const DB_NAME = 'inventario_db';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  unidad TEXT NOT NULL DEFAULT 'pza',
  precio_compra REAL NOT NULL DEFAULT 0,
  precio_venta INTEGER NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad INTEGER NOT NULL,
  motivo TEXT,
  lote_id INTEGER REFERENCES lotes(id),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad_inicial INTEGER NOT NULL,
  cantidad_restante INTEGER NOT NULL,
  costo_unitario REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proveedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  contacto TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  total REAL NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS compra_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  lote_id INTEGER REFERENCES lotes(id),
  cantidad INTEGER NOT NULL,
  costo_unitario REAL NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS ventas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total INTEGER NOT NULL DEFAULT 0,
  ganancia INTEGER NOT NULL DEFAULT 0,
  metodo_pago TEXT,
  nota TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venta_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'credito')),
  monto REAL NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS venta_detalle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  lote_id INTEGER NOT NULL REFERENCES lotes(id),
  cantidad INTEGER NOT NULL,
  precio_unitario INTEGER NOT NULL,
  costo_unitario REAL NOT NULL,
  presentacion_nombre TEXT,
  presentacion_factor INTEGER,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS presentaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  factor INTEGER NOT NULL,
  precio_venta REAL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_presentaciones_unicas
  ON presentaciones(producto_id, nombre) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS cuentas_cobrar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venta_id INTEGER NOT NULL DEFAULT 0,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  concepto TEXT,
  total INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS abonos_cobrar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_cobrar(id) ON DELETE CASCADE,
  valor INTEGER NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cuentas_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL DEFAULT 0,
  proveedor_id INTEGER NOT NULL REFERENCES proveedores(id),
  concepto TEXT,
  total REAL NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pagos_pagar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_pagar(id) ON DELETE CASCADE,
  valor REAL NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'operador',
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sync_estado (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync TEXT,
  pendiente_reset INTEGER NOT NULL DEFAULT 0,
  servidor TEXT,
  last_seq INTEGER,
  last_push TEXT,
  pendientes_envio TEXT,
  pendientes_pull TEXT,
  token TEXT
);

CREATE TABLE IF NOT EXISTS sesion (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(created_at);
CREATE INDEX IF NOT EXISTS idx_lotes_producto ON lotes(producto_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra ON compra_detalle(compra_id);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta ON venta_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta ON venta_pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_presentaciones_producto ON presentaciones(producto_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_cobrar_cliente ON cuentas_cobrar(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cobrar_cuenta ON abonos_cobrar(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_pagar_proveedor ON cuentas_pagar(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_pagos_pagar_cuenta ON pagos_pagar(cuenta_id);
`;

const TABLAS = [
  'abonos_cobrar',
  'cuentas_cobrar',
  'pagos_pagar',
  'cuentas_pagar',
  'venta_pagos',
  'venta_detalle',
  'ventas',
  'compra_detalle',
  'compras',
  'presentaciones',
  'proveedores',
  'clientes',
  'movimientos',
  'lotes',
  'productos',
  'categorias',
  'sesion',
  'usuarios',
  'sync_estado',
];

const TABLAS_NEGOCIO = [
  'abonos_cobrar',
  'cuentas_cobrar',
  'pagos_pagar',
  'cuentas_pagar',
  'venta_pagos',
  'venta_detalle',
  'ventas',
  'compra_detalle',
  'compras',
  'presentaciones',
  'proveedores',
  'clientes',
  'movimientos',
  'lotes',
  'productos',
  'categorias',
];

/** Tablas que se sincronizan con el backend (sin sesion ni sync_estado). */
const TABLAS_SYNC = [
  'categorias',
  'proveedores',
  'clientes',
  'productos',
  'presentaciones',
  'lotes',
  'movimientos',
  'compras',
  'compra_detalle',
  'ventas',
  'venta_detalle',
  'venta_pagos',
  'cuentas_cobrar',
  'abonos_cobrar',
  'cuentas_pagar',
  'pagos_pagar',
  'usuarios',
];

/** Expresión SQLite que genera un UUID v4. */
const UUID_SQL =
  "lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||" +
  "'-'||substr('89ab',abs(random())%4+1,1)||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6)))";

/** Tablas a las que hay que agregar la columna updated_at (solo productos ya la tiene). */
const TABLAS_SIN_UPDATED_AT = [
  'categorias',
  'movimientos',
  'lotes',
  'proveedores',
  'compras',
  'compra_detalle',
  'ventas',
  'venta_detalle',
  'clientes',
  'cuentas_cobrar',
  'abonos_cobrar',
  'cuentas_pagar',
  'pagos_pagar',
  'usuarios',
];

/** Tablas sin created_at en el esquema original: se agrega para la sincronización. */
const TABLAS_SIN_CREATED_AT = [
  'categorias',
  'proveedores',
  'clientes',
  'compra_detalle',
  'venta_detalle',
  'usuarios',
];

/** Tablas sin deleted_at en el esquema original (se usa para el borrado lógico). */
const TABLAS_SIN_DELETED_AT = [
  'productos',
  'movimientos',
  'proveedores',
  'clientes',
  'compras',
  'compra_detalle',
  'ventas',
  'venta_detalle',
  'cuentas_cobrar',
  'abonos_cobrar',
  'cuentas_pagar',
  'pagos_pagar',
];

/** Tablas de negocio que registran el usuario que creó cada fila (todas menos usuarios). */
const TABLAS_AUDITORIA = TABLAS_SYNC.filter((t) => t !== 'usuarios');

@Injectable({ providedIn: 'root' })
export class SqliteService {
  private readonly connection = new SQLiteConnection(CapacitorSQLite);
  private readonly isWeb = Capacitor.getPlatform() === 'web';
  private db?: SQLiteDBConnection;
  /** Usuario con sesión activa; se estampa en cada fila creada (auditoría). */
  private usuarioId: number | null = null;

  /** true si la app corre en navegador (web) en lugar de app nativa. */
  esWeb(): boolean {
    return this.isWeb;
  }

  async initialize(): Promise<void> {
    if (this.db) return;
    if (this.isWeb) {
      const jeepSqlite = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepSqlite);
      await customElements.whenDefined('jeep-sqlite');
      await this.connection.initWebStore();
    }
    const db = await this.connection.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      1,
      false,
    );
    await db.open();
    if (new URLSearchParams(window.location.search).has('reset')) {
      await this.eliminarTablas(db);
    }
    await db.execute(SCHEMA);
    await this.backfillLotesIniciales(db);
    await this.migrarCuentasManuales(db);
    await this.migrarPresentaciones(db);
    await this.migrarMetodosPago(db);
    await this.migrarSync(db);
    await this.migrarVentaPagos(db);
    this.db = db;
    await this.persist();
    // Carga el usuario con sesión activa para estamparlo en cada registro nuevo
    const sesion = await this.getUsuarioSesion();
    this.usuarioId = sesion?.id ?? null;
    // Recupera la dirección del servidor tras un restablecimiento local
    const estado = await this.getSyncEstado();
    const servidorGuardado = localStorage.getItem('servidor_sync');
    if (!estado.servidor && guardadoValido(servidorGuardado)) {
      await this.setSyncEstado({ servidor: servidorGuardado });
    }
  }

  private async eliminarTablas(db: SQLiteDBConnection): Promise<void> {
    await db.execute(TABLAS.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));
  }

  /**
   * Elimina los registros de negocio LOCALES y recrea el esquema vacío.
   * Preserva los usuarios y la sesión activa (el admin no se borra).
   * MySQL no se toca: al dejar last_seq en NULL, la próxima sincronización
   * descarga de nuevo todo el contenido del servidor (volcado completo).
   * Usada por el módulo de Ajustes; el reinicio total vía URL (?reset)
   * también elimina usuarios y sesión.
   */
  /**
   * Elimina todos los registros de negocio locales y recrea el esquema vacío.
   * Preserva los usuarios y la sesión activa (el admin no se borra).
   * MySQL (la fuente de verdad) NO se altera: al reiniciar los cursores, la
   * próxima sincronización descarga de nuevo todo el contenido del servidor.
   * Usada por el módulo de Ajustes; el reinicio total vía URL (?reset)
   * también elimina usuarios y sesión.
   */
  async reiniciarDatos(): Promise<void> {
    const db = await this.ready();
    await db.execute(TABLAS_NEGOCIO.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n'));
    await db.execute(SCHEMA);
    // El esquema base no incluye las columnas de sincronización (uuid,
    // updated_at, created_at, deleted_at, usuario_id) ni los triggers: se
    // reaplican para que la sync funcione sin necesidad de reiniciar la app.
    await this.migrarSync(db);
    // Sin last_seq, la próxima sync hace un volcado completo desde MySQL y el
    // dispositivo se rellena con todos los datos del negocio.
    await db.execute('UPDATE sync_estado SET last_sync = NULL, last_seq = NULL, last_push = NULL, pendientes_envio = NULL, pendientes_pull = NULL, pendiente_reset = 0');
    await this.persist();
  }

  /**
   * Productos creados antes del modelo de lotes: les genera un lote inicial
   * con su stock y costo actuales para que el costeo FIFO sea consistente.
   */
  private async backfillLotesIniciales(db: SQLiteDBConnection): Promise<void> {
    await db.execute(`
      INSERT INTO lotes (producto_id, cantidad_inicial, cantidad_restante, costo_unitario)
      SELECT p.id, p.stock, p.stock, p.precio_compra
      FROM productos p
      WHERE p.stock > 0
        AND NOT EXISTS (SELECT 1 FROM lotes l WHERE l.producto_id = p.id)
    `);
  }

  private async persist(): Promise<void> {
    if (this.isWeb) await this.connection.saveToStore(DB_NAME);
  }

  private async ready(): Promise<SQLiteDBConnection> {
    if (!this.db) await this.initialize();
    return this.db!;
  }

  private async query<T>(statement: string, values: unknown[] = []): Promise<T[]> {
    const db = await this.ready();
    const result = await db.query(statement, values);
    return (result.values as T[]) ?? [];
  }

  private async run(statement: string, values: unknown[] = []): Promise<number> {
    const db = await this.ready();
    const result = await db.run(statement, values);
    await this.persist();
    return result.changes?.lastId ?? 0;
  }

  async getCategorias(): Promise<Categoria[]> {
    return this.query<Categoria>('SELECT * FROM categorias ORDER BY nombre');
  }

  async addCategoria(categoria: Omit<Categoria, 'id'>): Promise<number> {
    return this.run(
      'INSERT INTO categorias (nombre, descripcion, usuario_id) VALUES (?, ?, ?)',
      [categoria.nombre, categoria.descripcion ?? null, this.usuarioId],
    );
  }

  async getProductos(): Promise<Producto[]> {
    return this.query<Producto>(
      `SELECT p.*, c.nombre AS categoria_nombre,
              (SELECT l.costo_unitario FROM lotes l
               WHERE l.producto_id = p.id ORDER BY l.id DESC LIMIT 1) AS costo_actual
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.activo = 1
       ORDER BY p.nombre`,
    );
  }

  async getProducto(id: number): Promise<Producto | undefined> {
    const rows = await this.query<Producto>(
      'SELECT * FROM productos WHERE id = ?',
      [id],
    );
    return rows[0];
  }

  /**
   * Genera el siguiente código P-XXXX saltando los ya usados: al sincronizar
   * varios dispositivos el MAX(id) local no coincide con los códigos existentes
   * (traídos por la sync), y un código repetido hacía fallar el INSERT.
   */
  async getNextProductoCodigo(): Promise<string> {
    const rows = await this.query<{ n: number }>(
      'SELECT COALESCE(MAX(id), 0) + 1 AS n FROM productos',
    );
    let n = rows[0]?.n ?? 1;
    for (;;) {
      const codigo = `P-${String(n).padStart(4, '0')}`;
      const usado = await this.query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM productos WHERE codigo = ?',
        [codigo],
      );
      if ((usado[0]?.n ?? 0) === 0) return codigo;
      n++;
    }
  }

  async addProducto(p: Omit<Producto, 'id'>): Promise<number> {
    return this.run(
      `INSERT INTO productos
         (codigo, nombre, descripcion, categoria_id, unidad,
          precio_compra, precio_venta, stock, stock_minimo, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.codigo,
        p.nombre,
        p.descripcion ?? null,
        p.categoria_id ?? null,
        p.unidad,
        p.precio_compra,
        p.precio_venta,
        p.stock,
        p.stock_minimo,
        this.usuarioId,
      ],
    );
  }

  async updateProducto(p: Producto): Promise<number> {
    return this.run(
      `UPDATE productos SET
         codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?,
         unidad = ?, precio_compra = ?, precio_venta = ?,
         stock = ?, stock_minimo = ?, activo = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
      [
        p.codigo,
        p.nombre,
        p.descripcion ?? null,
        p.categoria_id ?? null,
        p.unidad,
        p.precio_compra,
        p.precio_venta,
        p.stock,
        p.stock_minimo,
        p.activo,
        p.id!,
      ],
    );
  }

  /**
   * Borrado lógico: la fila permanece con activo=0 y deleted_at para que la
   * sincronización propague la eliminación al backend.
   */
  async deleteProducto(id: number): Promise<void> {
    await this.run(
      `UPDATE productos SET activo = 0, deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [id],
    );
  }

  async addMovimiento(mov: Omit<Movimiento, 'id'>): Promise<number> {
    const lastId = await this.run(
      'INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, lote_id, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
      [mov.producto_id, mov.tipo, mov.cantidad, mov.motivo ?? null, mov.lote_id ?? null, this.usuarioId],
    );
    await this.run(
      `UPDATE productos SET
         stock = CASE
           WHEN ? = 'entrada' THEN stock + ?
           WHEN ? = 'salida' THEN stock - ?
           ELSE ?
         END,
         updated_at = datetime('now')
       WHERE id = ?`,
      [mov.tipo, mov.cantidad, mov.tipo, mov.cantidad, mov.cantidad, mov.producto_id],
    );
    return lastId;
  }

  async getMovimiento(id: number): Promise<Movimiento | undefined> {
    const rows = await this.query<Movimiento>('SELECT * FROM movimientos WHERE id = ?', [id]);
    return rows[0];
  }

  /** Borrado lógico para que la sincronización propague la eliminación. */
  async eliminarMovimiento(id: number): Promise<void> {
    await this.run(
      "UPDATE movimientos SET deleted_at = datetime('now') WHERE id = ?",
      [id],
    );
  }

  async getMovimientos(productoId?: number): Promise<Movimiento[]> {
    const statement = productoId
      ? 'SELECT * FROM movimientos WHERE producto_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
      : 'SELECT * FROM movimientos WHERE deleted_at IS NULL ORDER BY created_at DESC';
    return this.query<Movimiento>(statement, productoId ? [productoId] : []);
  }

  async addLote(lote: Omit<Lote, 'id'>): Promise<number> {
    return this.run(
      `INSERT INTO lotes (producto_id, cantidad_inicial, cantidad_restante, costo_unitario, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [lote.producto_id, lote.cantidad_inicial, lote.cantidad_restante, lote.costo_unitario, this.usuarioId],
    );
  }

  async getLotes(productoId: number): Promise<Lote[]> {
    return this.query<Lote>(
      'SELECT * FROM lotes WHERE producto_id = ? AND cantidad_restante > 0 ORDER BY id',
      [productoId],
    );
  }

  async getLote(id: number): Promise<Lote | undefined> {
    const rows = await this.query<Lote>('SELECT * FROM lotes WHERE id = ?', [id]);
    return rows[0];
  }

  /**
   * Consume cantidades de los lotes más antiguos primero (FIFO).
   * Devuelve los consumos realizados (lote, cantidad, costo).
   */
  async consumirLotesFIFO(productoId: number, cantidad: number): Promise<{ lote_id: number; cantidad: number; costo_unitario: number }[]> {
    const lotes = await this.getLotes(productoId);
    const disponible = lotes.reduce((suma, l) => suma + l.cantidad_restante, 0);
    if (disponible < cantidad) {
      throw new Error(`Stock insuficiente: disponible ${disponible}`);
    }
    const consumos: { lote_id: number; cantidad: number; costo_unitario: number }[] = [];
    let pendiente = cantidad;
    for (const lote of lotes) {
      if (pendiente <= 0) break;
      const tomar = Math.min(lote.cantidad_restante, pendiente);
      await this.run('UPDATE lotes SET cantidad_restante = cantidad_restante - ? WHERE id = ?', [
        tomar,
        lote.id!,
      ]);
      consumos.push({ lote_id: lote.id!, cantidad: tomar, costo_unitario: lote.costo_unitario });
      pendiente -= tomar;
    }
    return consumos;
  }

  async getValorInventario(): Promise<number> {
    const rows = await this.query<{ v: number }>(
      'SELECT COALESCE(SUM(cantidad_restante * costo_unitario), 0) AS v FROM lotes l JOIN productos p ON p.id = l.producto_id WHERE p.activo = 1',
    );
    return rows[0]?.v ?? 0;
  }

  async getProveedores(): Promise<Proveedor[]> {
    return this.query<Proveedor>(
      'SELECT * FROM proveedores WHERE deleted_at IS NULL ORDER BY nombre',
    );
  }

  async addProveedor(proveedor: Omit<Proveedor, 'id'>): Promise<number> {
    return this.run('INSERT INTO proveedores (nombre, contacto, usuario_id) VALUES (?, ?, ?)', [
      proveedor.nombre,
      proveedor.contacto ?? null,
      this.usuarioId,
    ]);
  }

  async updateProveedor(proveedor: Proveedor): Promise<void> {
    await this.run(
      'UPDATE proveedores SET nombre = ?, contacto = ? WHERE id = ?',
      [proveedor.nombre, proveedor.contacto ?? null, proveedor.id!],
    );
  }

  /** Borrado lógico para que la sincronización propague la eliminación. */
  async eliminarProveedor(id: number): Promise<void> {
    await this.run(
      "UPDATE proveedores SET deleted_at = datetime('now') WHERE id = ?",
      [id],
    );
  }

  async updateCliente(cliente: Cliente): Promise<void> {
    await this.run('UPDATE clientes SET nombre = ? WHERE id = ?', [
      cliente.nombre,
      cliente.id!,
    ]);
  }

  /** Borrado lógico para que la sincronización propague la eliminación. */
  async eliminarCliente(id: number): Promise<void> {
    await this.run(
      "UPDATE clientes SET deleted_at = datetime('now') WHERE id = ?",
      [id],
    );
  }

  async addCompra(compra: Omit<Compra, 'id'>): Promise<number> {
    return this.run('INSERT INTO compras (proveedor_id, total, usuario_id) VALUES (?, ?, ?)', [
      compra.proveedor_id,
      compra.total,
      this.usuarioId,
    ]);
  }

  async addCompraDetalle(detalle: Omit<CompraDetalle, 'id'>): Promise<number> {
    return this.run(
      `INSERT INTO compra_detalle (compra_id, producto_id, lote_id, cantidad, costo_unitario, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [detalle.compra_id, detalle.producto_id, detalle.lote_id ?? null, detalle.cantidad, detalle.costo_unitario, this.usuarioId],
    );
  }

  async updateCompra(compraId: number, proveedorId: number, total: number): Promise<void> {
    await this.run(
      'UPDATE compras SET proveedor_id = ?, total = ? WHERE id = ?',
      [proveedorId, total, compraId],
    );
  }

  /** Borrado lógico de la compra y su detalle (propaga la sync). */
  async eliminarCompra(compraId: number): Promise<void> {
    await this.run(
      "UPDATE compra_detalle SET deleted_at = datetime('now') WHERE compra_id = ? AND deleted_at IS NULL",
      [compraId],
    );
    await this.run(
      "UPDATE compras SET deleted_at = datetime('now') WHERE id = ?",
      [compraId],
    );
  }

  /** Devuelve unidades a un lote (reversa de una venta). */
  async restaurarLote(loteId: number, cantidad: number): Promise<void> {
    await this.run(
      'UPDATE lotes SET cantidad_restante = cantidad_restante + ? WHERE id = ?',
      [cantidad, loteId],
    );
  }

  /** Retira unidades de un lote (reversa de una compra). */
  async reducirLote(loteId: number, cantidad: number): Promise<void> {
    await this.run(
      'UPDATE lotes SET cantidad_restante = MAX(cantidad_restante - ?, 0) WHERE id = ?',
      [cantidad, loteId],
    );
  }

  async getCompras(): Promise<Compra[]> {
    return this.query<Compra>(
      `SELECT c.*, pr.nombre AS proveedor_nombre
       FROM compras c
       JOIN proveedores pr ON pr.id = c.proveedor_id
       WHERE c.deleted_at IS NULL
       ORDER BY c.id DESC`,
    );
  }

  async getCompraDetalle(compraId: number): Promise<CompraDetalle[]> {
    return this.query<CompraDetalle>(
      `SELECT d.*, p.nombre AS producto_nombre
       FROM compra_detalle d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.compra_id = ? AND d.deleted_at IS NULL
       ORDER BY d.id`,
      [compraId],
    );
  }

  async addVenta(venta: Omit<Venta, 'id'>): Promise<number> {
    console.log('[ventas-debug] SqliteService.addVenta: nota =', JSON.stringify(venta.nota));
    return this.run(
      'INSERT INTO ventas (total, ganancia, metodo_pago, nota, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [venta.total, venta.ganancia, venta.metodo_pago ?? null, venta.nota ?? null, this.usuarioId],
    );
  }

  async addVentaDetalle(detalle: Omit<VentaDetalle, 'id'>): Promise<number> {
    return this.run(
      `INSERT INTO venta_detalle
         (venta_id, producto_id, lote_id, cantidad, precio_unitario, costo_unitario,
          presentacion_nombre, presentacion_factor, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        detalle.venta_id,
        detalle.producto_id,
        detalle.lote_id,
        detalle.cantidad,
        detalle.precio_unitario,
        detalle.costo_unitario,
        detalle.presentacion_nombre ?? null,
        detalle.presentacion_factor ?? null,
        this.usuarioId,
      ],
    );
  }

  async getVentas(): Promise<Venta[]> {
    const ventas = await this.query<Venta>('SELECT * FROM ventas WHERE deleted_at IS NULL ORDER BY id DESC');
    console.log('[ventas-debug] SqliteService.getVentas:', ventas.map((v) => ({ id: v.id, nota: v.nota ?? null })));
    return ventas;
  }

  async updateVenta(
    ventaId: number,
    total: number,
    ganancia: number,
    metodoPago: MetodoPagoVenta | null,
    nota?: string | null,
  ): Promise<void> {
    console.log('[ventas-debug] SqliteService.updateVenta: venta', ventaId, '| nota =', JSON.stringify(nota));
    await this.run(
      'UPDATE ventas SET total = ?, ganancia = ?, metodo_pago = ?, nota = ? WHERE id = ?',
      [total, ganancia, metodoPago ?? null, nota ?? null, ventaId],
    );
  }

  /** Borrado lógico del detalle de una venta al editarla (propaga la sync). */
  async eliminarVentaDetalle(ventaId: number): Promise<void> {
    await this.run(
      "UPDATE venta_detalle SET deleted_at = datetime('now') WHERE venta_id = ? AND deleted_at IS NULL",
      [ventaId],
    );
  }

  /** Borrado lógico de la venta, su detalle y sus pagos (propaga la sync). */
  async eliminarVenta(ventaId: number): Promise<void> {
    await this.run(
      "UPDATE venta_detalle SET deleted_at = datetime('now') WHERE venta_id = ? AND deleted_at IS NULL",
      [ventaId],
    );
    await this.run(
      "UPDATE venta_pagos SET deleted_at = datetime('now') WHERE venta_id = ? AND deleted_at IS NULL",
      [ventaId],
    );
    await this.run(
      "UPDATE ventas SET deleted_at = datetime('now') WHERE id = ?",
      [ventaId],
    );
  }

  async addVentaPagos(ventaId: number, pagos: Omit<PagoVenta, 'id' | 'venta_id'>[]): Promise<void> {
    for (const pago of pagos) {
      await this.run(
        'INSERT INTO venta_pagos (venta_id, metodo, monto, usuario_id) VALUES (?, ?, ?, ?)',
        [ventaId, pago.metodo, pago.monto, this.usuarioId],
      );
    }
  }

  async getVentaPagos(ventaId: number): Promise<PagoVenta[]> {
    return this.query<PagoVenta>(
      'SELECT * FROM venta_pagos WHERE venta_id = ? AND deleted_at IS NULL ORDER BY id',
      [ventaId],
    );
  }

  /** Borrado lógico de los pagos de una venta (al editarla se vuelven a crear). */
  async eliminarVentaPagos(ventaId: number): Promise<void> {
    await this.run(
      "UPDATE venta_pagos SET deleted_at = datetime('now') WHERE venta_id = ? AND deleted_at IS NULL",
      [ventaId],
    );
  }

  async getPresentaciones(productoId?: number): Promise<Presentacion[]> {
    const filtro = productoId ? 'WHERE producto_id = ? AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL';
    const sql = `SELECT * FROM presentaciones ${filtro} ORDER BY factor`;
    return this.query<Presentacion>(sql, productoId ? [productoId] : []);
  }

  async addPresentacion(p: Omit<Presentacion, 'id'>): Promise<number> {
    return this.run(
      'INSERT INTO presentaciones (producto_id, nombre, factor, precio_venta, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [p.producto_id, p.nombre, p.factor, p.precio_venta ?? null, this.usuarioId],
    );
  }

  async updatePresentacion(p: Presentacion): Promise<void> {
    await this.run(
      `UPDATE presentaciones SET nombre = ?, factor = ?, precio_venta = ?,
         updated_at = datetime('now')
       WHERE id = ?`,
      [p.nombre, p.factor, p.precio_venta ?? null, p.id!],
    );
  }

  /** Borrado lógico para que la sincronización propague la eliminación. */
  async deletePresentacion(id: number): Promise<void> {
    await this.run(
      `UPDATE presentaciones SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [id],
    );
  }
  async getVentaDetalle(ventaId: number): Promise<VentaDetalle[]> {
    return this.query<VentaDetalle>(
      `SELECT d.*, p.nombre AS producto_nombre
       FROM venta_detalle d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.venta_id = ? AND d.deleted_at IS NULL
       ORDER BY d.id`,
      [ventaId],
    );
  }

  async getClientes(): Promise<Cliente[]> {
    return this.query<Cliente>(
      'SELECT * FROM clientes WHERE deleted_at IS NULL ORDER BY nombre',
    );
  }

  async addCliente(cliente: Omit<Cliente, 'id'>): Promise<number> {
    return this.run('INSERT INTO clientes (nombre, usuario_id) VALUES (?, ?)', [
      cliente.nombre,
      this.usuarioId,
    ]);
  }

  async addCuentaCobrar(cuenta: Omit<CuentaCobrar, 'id'>): Promise<number> {
    return this.run(
      'INSERT INTO cuentas_cobrar (venta_id, cliente_id, total, concepto, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [cuenta.venta_id, cuenta.cliente_id, cuenta.total, cuenta.concepto ?? null, this.usuarioId],
    );
  }

  async getCuentasCobrar(fecha?: string | null, usuarioId?: number | null): Promise<CuentaCobrar[]> {
    const condiciones: string[] = [];
    const params: (string | number)[] = [];
    if (fecha) condiciones.push('date(cc.created_at) = ?');
    if (usuarioId != null) condiciones.push('cc.usuario_id = ?');
    if (fecha) params.push(fecha);
    if (usuarioId != null) params.push(usuarioId);
    const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    return this.query<CuentaCobrar>(
      `SELECT cc.*, cl.nombre AS cliente_nombre,
              (SELECT COALESCE(SUM(a.valor), 0) FROM abonos_cobrar a
               WHERE a.cuenta_id = cc.id AND a.deleted_at IS NULL) AS abonado
       FROM cuentas_cobrar cc
       JOIN clientes cl ON cl.id = cc.cliente_id
       WHERE cc.deleted_at IS NULL
       ${filtro ? `AND ${filtro.replace(/^WHERE /, '')}` : ''}
       ORDER BY cc.id DESC`,
      params,
    );
  }

  async addAbonoCobrar(abono: Omit<AbonoCobrar, 'id'>): Promise<number> {
    return this.run('INSERT INTO abonos_cobrar (cuenta_id, valor, usuario_id) VALUES (?, ?, ?)', [
      abono.cuenta_id,
      abono.valor,
      this.usuarioId,
    ]);
  }

  async getCuentaCobrarPorVenta(ventaId: number): Promise<CuentaCobrar | undefined> {
    const rows = await this.query<CuentaCobrar>(
      `SELECT cc.*,
              (SELECT COALESCE(SUM(valor), 0) FROM abonos_cobrar
               WHERE cuenta_id = cc.id AND deleted_at IS NULL) AS abonado
       FROM cuentas_cobrar cc
       WHERE cc.venta_id = ? AND cc.deleted_at IS NULL`,
      [ventaId],
    );
    return rows[0];
  }

  async updateCuentaCobrar(cuentaId: number, clienteId: number, total: number): Promise<void> {
    await this.run('UPDATE cuentas_cobrar SET cliente_id = ?, total = ? WHERE id = ?', [
      clienteId,
      total,
      cuentaId,
    ]);
  }

  /** Borrado lógico de la cuenta y sus abonos (propaga la sync). */
  async eliminarCuentaCobrar(cuentaId: number): Promise<void> {
    await this.run(
      "UPDATE abonos_cobrar SET deleted_at = datetime('now') WHERE cuenta_id = ? AND deleted_at IS NULL",
      [cuentaId],
    );
    await this.run(
      "UPDATE cuentas_cobrar SET deleted_at = datetime('now') WHERE id = ?",
      [cuentaId],
    );
  }

  /** Borrado lógico del abono (propaga la sync). */
  async eliminarAbonoCobrar(abonoId: number): Promise<void> {
    await this.run(
      "UPDATE abonos_cobrar SET deleted_at = datetime('now') WHERE id = ?",
      [abonoId],
    );
  }

  async getAbonosCobrar(cuentaId: number): Promise<AbonoCobrar[]> {
    return this.query<AbonoCobrar>(
      'SELECT * FROM abonos_cobrar WHERE cuenta_id = ? AND deleted_at IS NULL ORDER BY id DESC',
      [cuentaId],
    );
  }

  async addCuentaPagar(cuenta: Omit<CuentaPagar, 'id'>): Promise<number> {
    return this.run(
      'INSERT INTO cuentas_pagar (compra_id, proveedor_id, total, concepto, usuario_id) VALUES (?, ?, ?, ?, ?)',
      [cuenta.compra_id, cuenta.proveedor_id, cuenta.total, cuenta.concepto ?? null, this.usuarioId],
    );
  }

  async getCuentasPagar(fecha?: string | null, usuarioId?: number | null): Promise<CuentaPagar[]> {
    const condiciones: string[] = [];
    const params: (string | number)[] = [];
    if (fecha) condiciones.push('date(cp.created_at) = ?');
    if (usuarioId != null) condiciones.push('cp.usuario_id = ?');
    const filtro = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    if (fecha) params.push(fecha);
    if (usuarioId != null) params.push(usuarioId);
    return this.query<CuentaPagar>(
      `SELECT cp.*, pr.nombre AS proveedor_nombre,
              (SELECT COALESCE(SUM(pg.valor), 0) FROM pagos_pagar pg
               WHERE pg.cuenta_id = cp.id AND pg.deleted_at IS NULL) AS abonado
       FROM cuentas_pagar cp
       JOIN proveedores pr ON pr.id = cp.proveedor_id
       WHERE cp.deleted_at IS NULL
       ${filtro ? `AND ${filtro.replace(/^WHERE /, '')}` : ''}
       ORDER BY cp.id DESC`,
      params,
    );
  }

  async addPagoPagar(pago: Omit<AbonoPagar, 'id'>): Promise<number> {
    return this.run('INSERT INTO pagos_pagar (cuenta_id, valor, usuario_id) VALUES (?, ?, ?)', [
      pago.cuenta_id,
      pago.valor,
      this.usuarioId,
    ]);
  }

  async getCuentaPagarPorCompra(compraId: number): Promise<CuentaPagar | undefined> {
    const rows = await this.query<CuentaPagar>(
      `SELECT cp.*,
              (SELECT COALESCE(SUM(valor), 0) FROM pagos_pagar
               WHERE cuenta_id = cp.id AND deleted_at IS NULL) AS abonado
       FROM cuentas_pagar cp
       WHERE cp.compra_id = ? AND cp.deleted_at IS NULL`,
      [compraId],
    );
    return rows[0];
  }

  async updateCuentaPagar(cuentaId: number, proveedorId: number, total: number): Promise<void> {
    await this.run('UPDATE cuentas_pagar SET proveedor_id = ?, total = ? WHERE id = ?', [
      proveedorId,
      total,
      cuentaId,
    ]);
  }

  /** Borrado lógico de la cuenta y sus pagos (propaga la sync). */
  async eliminarCuentaPagar(cuentaId: number): Promise<void> {
    await this.run(
      "UPDATE pagos_pagar SET deleted_at = datetime('now') WHERE cuenta_id = ? AND deleted_at IS NULL",
      [cuentaId],
    );
    await this.run(
      "UPDATE cuentas_pagar SET deleted_at = datetime('now') WHERE id = ?",
      [cuentaId],
    );
  }

  /** Borrado lógico del pago (propaga la sync). */
  async eliminarPagoPagar(pagoId: number): Promise<void> {
    await this.run(
      "UPDATE pagos_pagar SET deleted_at = datetime('now') WHERE id = ?",
      [pagoId],
    );
  }

  /**
   * Migraciones para bases de datos creadas antes de las cuentas manuales:
   * agrega la columna concepto si aún no existe.
   */
  private async migrarCuentasManuales(db: SQLiteDBConnection): Promise<void> {
    for (const sql of [
      'ALTER TABLE cuentas_cobrar ADD COLUMN concepto TEXT',
      'ALTER TABLE cuentas_pagar ADD COLUMN concepto TEXT',
      'ALTER TABLE ventas ADD COLUMN metodo_pago TEXT',
      // Nota libre de la venta (referencia, observación) para el recibo
      'ALTER TABLE ventas ADD COLUMN nota TEXT',
      // Enlace lote↔compra para poder revertir el inventario al eliminar/editar
      'ALTER TABLE compra_detalle ADD COLUMN lote_id INTEGER',
      // Enlace lote↔movimiento para poder revertir los ajustes manuales
      'ALTER TABLE movimientos ADD COLUMN lote_id INTEGER',
    ]) {
      try {
        await db.execute(sql);
        console.log('[ventas-debug] migración aplicada:', sql);
      } catch {
        // La columna ya existe
      }
    }
  }

  /**
   * Migración para bases creadas antes de las presentaciones de venta:
   * agrega las columnas descriptivas al detalle de venta si aún no existen.
   */
  private async migrarPresentaciones(db: SQLiteDBConnection): Promise<void> {
    for (const sql of [
      'ALTER TABLE venta_detalle ADD COLUMN presentacion_nombre TEXT',
      'ALTER TABLE venta_detalle ADD COLUMN presentacion_factor INTEGER',
    ]) {
      try {
        await db.execute(sql);
      } catch {
        // La columna ya existe
      }
    }
  }

  /**
   * Prepara las tablas para la sincronización con el backend:
   *  - columna uuid: identidad global de cada fila (los ids locales son AUTOINCREMENT)
   *  - columna updated_at: marca de cambio para la sync incremental
   *  - triggers: asignan uuid al insertar y actualizan updated_at al modificar
   * Todo es idempotente para poder ejecutarse en cada arranque.
   */
  private async migrarSync(db: SQLiteDBConnection): Promise<void> {
    // Si una ejecución anterior quedó a medias, pueden existir triggers que
    // referencian columnas aún inexistentes; SQLite revalida los triggers en
    // cada ALTER TABLE y fallaría. Se eliminan y se recrean al final.
    for (const tabla of TABLAS_SYNC) {
      await db.execute(`DROP TRIGGER IF EXISTS trg_sync_${tabla}_ins`);
      await db.execute(`DROP TRIGGER IF EXISTS trg_sync_${tabla}_upd`);
    }
    for (const tabla of TABLAS_SYNC) {
      await this.agregarColumnaSiFalta(db, tabla, 'uuid', 'TEXT');
    }
    for (const tabla of TABLAS_SIN_UPDATED_AT) {
      // Sin DEFAULT: SQLite no permite valores por defecto expresión en ALTER TABLE
      await this.agregarColumnaSiFalta(db, tabla, 'updated_at', 'TEXT');
    }
    for (const tabla of TABLAS_SIN_CREATED_AT) {
      await this.agregarColumnaSiFalta(db, tabla, 'created_at', 'TEXT');
    }
    for (const tabla of TABLAS_SIN_DELETED_AT) {
      await this.agregarColumnaSiFalta(db, tabla, 'deleted_at', 'TEXT');
    }
    for (const tabla of TABLAS_AUDITORIA) {
      await this.agregarColumnaSiFalta(db, tabla, 'usuario_id', 'INTEGER');
    }
    // Cursor y marca del push para la sincronización por changelog
    await this.agregarColumnaSiFalta(db, 'sync_estado', 'last_seq', 'INTEGER');
    await this.agregarColumnaSiFalta(db, 'sync_estado', 'last_push', 'TEXT');
    await this.agregarColumnaSiFalta(db, 'sync_estado', 'pendientes_envio', 'TEXT');
    await this.agregarColumnaSiFalta(db, 'sync_estado', 'pendientes_pull', 'TEXT');
    await this.agregarColumnaSiFalta(db, 'sync_estado', 'token', 'TEXT');
    await this.agregarColumnaSiFalta(db, 'usuarios', 'rol', "TEXT NOT NULL DEFAULT 'operador'");
    await this.agregarColumnaSiFalta(db, 'usuarios', 'activo', 'INTEGER NOT NULL DEFAULT 1');
    for (const tabla of TABLAS_SIN_CREATED_AT) {
      await db.execute(
        `UPDATE ${tabla} SET created_at = datetime('now') WHERE created_at IS NULL`,
      );
    }
    for (const tabla of TABLAS_SYNC) {
      await db.execute(`UPDATE ${tabla} SET updated_at = datetime('now') WHERE updated_at IS NULL`);
    }
    for (const tabla of TABLAS_SYNC) {
      // Se recrea en cada arranque: garantiza que las filas nuevas tengan
      // created_at/updated_at aunque el INSERT no las asigne (sin ellas la
      // sync las omite, porque filtra por updated_at > last_sync).
      await this.crearTriggersSync(db, tabla);
    }
    for (const tabla of TABLAS_SYNC) {
      await db.execute(`UPDATE ${tabla} SET uuid = ${UUID_SQL} WHERE uuid IS NULL`);
    }
    await this.migrarUnicidades(db);
  }

  /**
   * Agrega una columna a una tabla solo si no existe. A diferencia de un
   * try/catch ciego sobre el ALTER, un fallo por otra razón (tabla bloqueada,
   * store de solo lectura, etc.) queda registrado en consola y es visible.
   */
  private async agregarColumnaSiFalta(
    db: SQLiteDBConnection,
    tabla: string,
    columna: string,
    definicion: string,
  ): Promise<void> {
    const info = await db.query(`PRAGMA table_info(${tabla})`);
    const existe = ((info.values as { name: string }[] | undefined) ?? []).some((c) => c.name === columna);
    if (existe) return;
    try {
      await db.execute(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
    } catch (error) {
      console.error(`[sqlite] No se pudo agregar la columna ${columna} a ${tabla}`, error);
    }
  }

  /**
   * Ventas creadas antes de la tabla venta_pagos: les genera su pago único
   * (efectivo o transferencia por el total) para que los reportes por método
   * y la sync sean consistentes.
   */
  private async migrarVentaPagos(db: SQLiteDBConnection): Promise<void> {
    await db.execute(`
      INSERT INTO venta_pagos (venta_id, metodo, monto)
      SELECT v.id, v.metodo_pago, v.total
      FROM ventas v
      WHERE v.metodo_pago IN ('efectivo', 'transferencia')
        AND v.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.deleted_at IS NULL
        )
    `);
  }

  /**
   * Amplía el CHECK de venta_pagos.metodo para aceptar 'credito' (partes de
   * pago mixtas con crédito). SQLite no permite alterar una restricción CHECK:
   * se reconstruye la tabla conservando todas sus columnas (incluidas uuid y
   * usuario_id agregadas por la sync) y sus filas. Debe ejecutarse ANTES de
   * migrarSync para que los triggers se creen sobre la tabla final.
   */
  private async migrarMetodosPago(db: SQLiteDBConnection): Promise<void> {
    const master = await db.query(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'venta_pagos'",
    );
    const sql = (((master.values ?? []) as { sql?: string }[])[0]?.sql ?? '');
    if (!sql || sql.includes("'credito'")) return;
    const info = await db.query('PRAGMA table_info(venta_pagos)');
    const columnas = ((info.values ?? []) as { name: string }[]).map((c) => c.name);
    const lista = columnas.join(', ');
    await db.execute(`
      DROP TRIGGER IF EXISTS trg_sync_venta_pagos_ins;
      DROP TRIGGER IF EXISTS trg_sync_venta_pagos_upd;
      ALTER TABLE venta_pagos RENAME TO venta_pagos_vieja;
      CREATE TABLE venta_pagos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
        metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'credito')),
        monto REAL NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // La tabla vieja pudo tener columnas de sync (uuid, usuario_id) agregadas
    // con ALTER TABLE; se reagregan antes de copiar las filas.
    await this.agregarColumnaSiFalta(db, 'venta_pagos', 'uuid', 'TEXT');
    await this.agregarColumnaSiFalta(db, 'venta_pagos', 'usuario_id', 'INTEGER');
    await db.execute(`
      INSERT INTO venta_pagos (${lista}) SELECT ${lista} FROM venta_pagos_vieja;
      DROP TABLE venta_pagos_vieja;
    `);
  }

  private async crearTriggersSync(db: SQLiteDBConnection, tabla: string): Promise<void> {
    await db.execute(`DROP TRIGGER IF EXISTS trg_sync_${tabla}_ins`);
    // run() y no execute(): execute() parte el SQL por ";" en Android y
    // compila el CREATE TRIGGER sin el END (error "incomplete input").
    await db.run(
      `CREATE TRIGGER trg_sync_${tabla}_ins AFTER INSERT ON ${tabla}
       BEGIN
         UPDATE ${tabla} SET
           uuid = COALESCE(uuid, ${UUID_SQL}),
           created_at = COALESCE(created_at, datetime('now')),
           updated_at = COALESCE(updated_at, datetime('now'))
         WHERE id = NEW.id;
       END;`,
    );
    await db.run(
      `CREATE TRIGGER IF NOT EXISTS trg_sync_${tabla}_upd AFTER UPDATE ON ${tabla}
       BEGIN
         UPDATE ${tabla} SET updated_at = datetime('now')
         WHERE id = NEW.id AND updated_at = OLD.updated_at AND uuid = OLD.uuid;
       END;`,
    );
  }

  /**
   * Quita las restricciones UNIQUE de codigo/nombre que el backend ya no tiene:
   * al sincronizar varios dispositivos los ids locales se asignan en otro orden,
   * de modo que un código o nombre repetido impedía insertar filas traídas por
   * la sync y hasta generar el código del siguiente producto. Reconstruye solo
   * las tablas cuyo CREATE TABLE aún declara UNIQUE.
   */
  private async migrarUnicidades(db: SQLiteDBConnection): Promise<void> {
    const reconstrucciones: Record<string, { create: string; columnas: string; indices?: string[] }> = {
      productos: {
        create: `CREATE TABLE productos_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT NOT NULL,
          nombre TEXT NOT NULL,
          descripcion TEXT,
          categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
          unidad TEXT NOT NULL DEFAULT 'pza',
          precio_compra REAL NOT NULL DEFAULT 0,
          precio_venta INTEGER NOT NULL DEFAULT 0,
          stock INTEGER NOT NULL DEFAULT 0,
          stock_minimo INTEGER NOT NULL DEFAULT 0,
          activo INTEGER NOT NULL DEFAULT 1,
          deleted_at TEXT,
          uuid TEXT,
          usuario_id INTEGER,
          created_at TEXT,
          updated_at TEXT
        )`,
        columnas:
          'id, codigo, nombre, descripcion, categoria_id, unidad, precio_compra, precio_venta, stock, stock_minimo, activo, deleted_at, uuid, usuario_id, created_at, updated_at',
        indices: ['CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id)'],
      },
      categorias: {
        create: `CREATE TABLE categorias_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          descripcion TEXT,
          uuid TEXT,
          usuario_id INTEGER,
          deleted_at TEXT,
          created_at TEXT,
          updated_at TEXT
        )`,
        columnas: 'id, nombre, descripcion, uuid, usuario_id, created_at, updated_at',
      },
      proveedores: {
        create: `CREATE TABLE proveedores_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          contacto TEXT,
          uuid TEXT,
          usuario_id INTEGER,
          deleted_at TEXT,
          created_at TEXT,
          updated_at TEXT
        )`,
        columnas: 'id, nombre, contacto, uuid, usuario_id, deleted_at, created_at, updated_at',
      },
      clientes: {
        create: `CREATE TABLE clientes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nombre TEXT NOT NULL,
          uuid TEXT,
          usuario_id INTEGER,
          deleted_at TEXT,
          created_at TEXT,
          updated_at TEXT
        )`,
        columnas: 'id, nombre, uuid, usuario_id, deleted_at, created_at, updated_at',
      },
    };
    for (const [tabla, cfg] of Object.entries(reconstrucciones)) {
      const definicion = await db.query(
        'SELECT sql FROM sqlite_master WHERE type = ? AND name = ?',
        ['table', tabla],
      );
      const sql = String((definicion.values as { sql?: string }[] | undefined)?.[0]?.sql ?? '');
      if (!/UNIQUE/i.test(sql)) continue;
      // Solo se copian las columnas que existen en la tabla origen: las bases
      // antiguas pueden carecer de alguna (p. ej. deleted_at en categorias).
      const info = await db.query(`PRAGMA table_info(${tabla})`);
      const existentes = new Set(
        ((info.values as { name: string }[] | undefined) ?? []).map((c) => c.name),
      );
      const columnas = cfg.columnas
        .split(',')
        .map((c) => c.trim())
        .filter((c) => existentes.has(c))
        .join(', ');
      await db.execute(`DROP TRIGGER IF EXISTS trg_sync_${tabla}_ins`);
      await db.execute(`DROP TRIGGER IF EXISTS trg_sync_${tabla}_upd`);
      await db.execute(`DROP TABLE IF EXISTS ${tabla}_new`);
      await db.execute(cfg.create);
      await db.execute(
        `INSERT INTO ${tabla}_new (${columnas}) SELECT ${columnas} FROM ${tabla}`,
      );
      await db.execute(`DROP TABLE ${tabla}`);
      await db.execute(`ALTER TABLE ${tabla}_new RENAME TO ${tabla}`);
      for (const indice of cfg.indices ?? []) {
        await db.execute(indice);
      }
      await this.crearTriggersSync(db, tabla);
    }
  }

  async getUsuarioPorLogin(usuario: string): Promise<Usuario | undefined> {
    const rows = await this.query<Usuario>('SELECT * FROM usuarios WHERE usuario = ?', [
      usuario,
    ]);
    return rows[0];
  }

  /**
   * Garantiza que exista al menos un administrador activo: si no hay ninguno
   * con rol 'admin' y activo, promueve al primer usuario activo (orden por id).
   */
  async promoverPrimerAdmin(): Promise<void> {
    const hayAdmin = await this.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1",
    );
    if ((hayAdmin[0]?.n ?? 0) > 0) return;
    await this.run(
      `UPDATE usuarios SET rol = 'admin', updated_at = datetime('now')
       WHERE id = (SELECT MIN(id) FROM usuarios WHERE activo = 1)`,
    );
  }

  /** Actualiza la contraseña de un usuario; el cambio se propaga en la sync. */
  async cambiarClaveUsuario(usuarioId: number, claveHash: string): Promise<void> {
    await this.run(
      `UPDATE usuarios SET clave_hash = ?, updated_at = datetime('now') WHERE id = ?`,
      [claveHash, usuarioId],
    );
  }

  async addUsuario(u: Omit<Usuario, 'id'>): Promise<number> {
    return this.run(
      'INSERT INTO usuarios (usuario, nombre, clave_hash, rol, activo) VALUES (?, ?, ?, ?, 1)',
      [u.usuario, u.nombre, u.clave_hash, u.rol ?? 'operador'],
    );
  }

  /** Activa o desactiva un usuario (borrado lógico para personal que ya no trabaja en la empresa). */
  async setUsuarioActivo(id: number, activo: number): Promise<void> {
    await this.run(
      `UPDATE usuarios SET activo = ?, updated_at = datetime('now') WHERE id = ?`,
      [activo, id],
    );
  }

  async contarAdminsActivos(): Promise<number> {
    const rows = await this.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1",
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * Elimina un usuario si no tiene registros relacionados (auditoría). Si los
   * tiene, lo desactiva para conservar el histórico de ventas, compras, etc.
   */
  async eliminarUsuario(id: number): Promise<'eliminado' | 'inactivado'> {
    for (const tabla of TABLAS_AUDITORIA) {
      const rows = await this.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${tabla} WHERE usuario_id = ?`,
        [id],
      );
      if ((rows[0]?.n ?? 0) > 0) {
        await this.setUsuarioActivo(id, 0);
        return 'inactivado';
      }
    }
    await this.run('DELETE FROM sesion WHERE usuario_id = ?', [id]);
    await this.run('DELETE FROM usuarios WHERE id = ?', [id]);
    return 'eliminado';
  }

  async contarUsuarios(): Promise<number> {
    const rows = await this.query<{ n: number }>('SELECT COUNT(*) AS n FROM usuarios');
    return rows[0]?.n ?? 0;
  }

  async setSesion(usuarioId: number): Promise<void> {
    await this.run('INSERT OR REPLACE INTO sesion (id, usuario_id) VALUES (1, ?)', [usuarioId]);
    this.usuarioId = usuarioId;
  }

  async getUsuarioSesion(): Promise<Usuario | undefined> {
    const rows = await this.query<Usuario>(
      `SELECT u.* FROM sesion s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = 1`,
    );
    return rows[0];
  }

  async limpiarSesion(): Promise<void> {
    await this.run('DELETE FROM sesion WHERE id = 1');
    this.usuarioId = null;
  }

  async getPagosPagar(cuentaId: number): Promise<AbonoPagar[]> {
    return this.query<AbonoPagar>(
      'SELECT * FROM pagos_pagar WHERE cuenta_id = ? AND deleted_at IS NULL ORDER BY id DESC',
      [cuentaId],
    );
  }

  async getResumenVentas(fecha?: string | null, usuarioId?: number | null): Promise<{ total: number; ganancia: number; cantidad: number }> {
    const { filtro, params } = this.filtroFechaUsuario(fecha, usuarioId);
    const rows = await this.query<{ total: number; ganancia: number; cantidad: number }>(
      `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(ganancia), 0) AS ganancia, COUNT(*) AS cantidad FROM ventas ${filtro}`,
      params,
    );
    return rows[0] ?? { total: 0, ganancia: 0, cantidad: 0 };
  }

  async getResumenVentasHoy(usuarioId?: number | null): Promise<{ total: number; ganancia: number; cantidad: number }> {
    const filtro = usuarioId != null ? 'AND usuario_id = ?' : '';
    const rows = await this.query<{ total: number; ganancia: number; cantidad: number }>(
      `SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(ganancia), 0) AS ganancia, COUNT(*) AS cantidad
       FROM ventas WHERE date(created_at) = date('now') AND deleted_at IS NULL ${filtro}`,
      usuarioId != null ? [usuarioId] : [],
    );
    return rows[0] ?? { total: 0, ganancia: 0, cantidad: 0 };
  }

  async getRecaudoPorMetodo(fecha?: string | null, usuarioId?: number | null): Promise<{ efectivo: number; transferencia: number }> {
    const condiciones: string[] = ['vp.deleted_at IS NULL', 'v.deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (fecha) {
      condiciones.push('date(v.created_at) = ?');
      params.push(fecha);
    }
    if (usuarioId != null) {
      condiciones.push('v.usuario_id = ?');
      params.push(usuarioId);
    }
    const rows = await this.query<{ metodo: string; total: number }>(
      `SELECT vp.metodo, COALESCE(SUM(vp.monto), 0) AS total
       FROM venta_pagos vp
       JOIN ventas v ON v.id = vp.venta_id
       WHERE ${condiciones.join(' AND ')}
       GROUP BY vp.metodo`,
      params,
    );
    const recaudo = { efectivo: 0, transferencia: 0 };
    for (const fila of rows) {
      if (fila.metodo === 'efectivo') recaudo.efectivo = fila.total;
      else if (fila.metodo === 'transferencia') recaudo.transferencia = fila.total;
    }
    return recaudo;
  }

  async getResumenCompras(fecha?: string | null, usuarioId?: number | null): Promise<number> {
    const { filtro, params } = this.filtroFechaUsuario(fecha, usuarioId);
    const rows = await this.query<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) AS total FROM compras ${filtro}`,
      params,
    );
    return rows[0]?.total ?? 0;
  }

  /** Cláusula WHERE combinada de fecha (día exacto) y usuario para consultas agregadas.
   *  Excluye siempre los registros eliminados lógicamente. */
  private filtroFechaUsuario(fecha?: string | null, usuarioId?: number | null): { filtro: string; params: (string | number)[] } {
    const condiciones: string[] = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (fecha) {
      condiciones.push('date(created_at) = ?');
      params.push(fecha);
    }
    if (usuarioId != null) {
      condiciones.push('usuario_id = ?');
      params.push(usuarioId);
    }
    return { filtro: `WHERE ${condiciones.join(' AND ')}`, params };
  }

  async getProductosStockBajo(): Promise<number> {
    const rows = await this.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM productos WHERE activo = 1 AND stock < stock_minimo',
    );
    return rows[0]?.n ?? 0;
  }

  async getProductosConStockBajo(): Promise<ProductoStockBajo[]> {
    return this.query<ProductoStockBajo>(
      `SELECT id, nombre, stock, stock_minimo
       FROM productos
       WHERE activo = 1 AND stock < stock_minimo
       ORDER BY nombre`,
    );
  }

  async getCantidadProductos(): Promise<number> {
    const rows = await this.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM productos WHERE activo = 1',
    );
    return rows[0]?.n ?? 0;
  }

  async getUsuarios(): Promise<Usuario[]> {
    return this.query<Usuario>(
      'SELECT id, usuario, nombre, rol, activo FROM usuarios ORDER BY activo DESC, nombre',
    );
  }

  /**
   * Actividad por usuario (agrupada por tipo de operación) para el informe de
   * reportes. Con fecha filtra por día; sin filtro cubre todo el historial.
   * Las filas sin usuario_id (creadas antes de la auditoría) se agrupan como
   * "(sin usuario)".
   */
  async getActividadPorUsuario(fecha?: string | null): Promise<ActividadUsuario[]> {
    const filtro = fecha ? 'WHERE date(created_at) = ?' : '';
    const params = fecha ? [fecha] : [];
    // Tablas con borrado lógico: se excluyen las filas eliminadas
    const filtroLogico = fecha
      ? "WHERE deleted_at IS NULL AND date(created_at) = ?"
      : 'WHERE deleted_at IS NULL';
    const [ventas, compras, movimientos, productos, clientes, proveedores, categorias, cuentasCobrar, abonos, cuentasPagar, pagos, usuarios] =
      await Promise.all([
        this.query<{ usuario_id: number | null; n: number; total: number; ganancia: number }>(
          `SELECT usuario_id, COUNT(*) AS n, SUM(total) AS total, SUM(ganancia) AS ganancia
           FROM ventas ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number; total: number }>(
          `SELECT usuario_id, COUNT(*) AS n, SUM(total) AS total
           FROM compras ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM movimientos ${filtro} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM productos ${filtro} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM clientes ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM proveedores ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM categorias ${filtro} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM cuentas_cobrar ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number; total: number }>(
          `SELECT usuario_id, COUNT(*) AS n, SUM(valor) AS total
           FROM abonos_cobrar ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number }>(
          `SELECT usuario_id, COUNT(*) AS n FROM cuentas_pagar ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ usuario_id: number | null; n: number; total: number }>(
          `SELECT usuario_id, COUNT(*) AS n, SUM(valor) AS total
           FROM pagos_pagar ${filtroLogico} GROUP BY usuario_id`,
          params,
        ),
        this.query<{ id: number; nombre: string }>('SELECT id, nombre FROM usuarios'),
      ]);

    const nombres = new Map(usuarios.map((u) => [u.id!, u.nombre]));
    const acumulado = new Map<number, ActividadUsuario>();
    const obtener = (usuarioId: number | null): ActividadUsuario => {
      const clave = usuarioId ?? 0;
      let a = acumulado.get(clave);
      if (!a) {
        a = {
          usuario_id: usuarioId,
          nombre: usuarioId ? nombres.get(usuarioId) ?? '(sin usuario)' : '(sin usuario)',
          ventasCantidad: 0, ventasTotal: 0, ventasGanancia: 0,
          comprasCantidad: 0, comprasTotal: 0,
          movimientos: 0, productosCreados: 0, clientesCreados: 0,
          proveedoresCreados: 0, categoriasCreadas: 0,
          cuentasCobrar: 0, abonosCantidad: 0, abonosTotal: 0,
          cuentasPagar: 0, pagosCantidad: 0, pagosTotal: 0,
        };
        acumulado.set(clave, a);
      }
      return a;
    };

    for (const f of ventas) {
      const a = obtener(f.usuario_id);
      a.ventasCantidad += f.n;
      a.ventasTotal += f.total;
      a.ventasGanancia += f.ganancia;
    }
    for (const f of compras) {
      const a = obtener(f.usuario_id);
      a.comprasCantidad += f.n;
      a.comprasTotal += f.total;
    }
    for (const f of movimientos) obtener(f.usuario_id).movimientos += f.n;
    for (const f of productos) obtener(f.usuario_id).productosCreados += f.n;
    for (const f of clientes) obtener(f.usuario_id).clientesCreados += f.n;
    for (const f of proveedores) obtener(f.usuario_id).proveedoresCreados += f.n;
    for (const f of categorias) obtener(f.usuario_id).categoriasCreadas += f.n;
    for (const f of cuentasCobrar) obtener(f.usuario_id).cuentasCobrar += f.n;
    for (const f of abonos) {
      const a = obtener(f.usuario_id);
      a.abonosCantidad += f.n;
      a.abonosTotal += f.total;
    }
    for (const f of cuentasPagar) obtener(f.usuario_id).cuentasPagar += f.n;
    for (const f of pagos) {
      const a = obtener(f.usuario_id);
      a.pagosCantidad += f.n;
      a.pagosTotal += f.total;
    }
    return [...acumulado.values()].sort(
      (x, y) => y.ventasTotal + y.comprasTotal - (x.ventasTotal + x.comprasTotal),
    );
  }

  // ===== Acceso para el servicio de sincronización =====

  consultar<T>(sql: string, valores: unknown[] = []): Promise<T[]> {
    return this.query<T>(sql, valores);
  }

  async ejecutar(sql: string, valores: unknown[] = []): Promise<void> {
    await this.run(sql, valores);
  }

  async getSyncEstado(): Promise<{
    last_sync: string | null;
    pendiente_reset: number;
    servidor: string | null;
    last_seq: number | null;
    last_push: string | null;
    pendientes_envio: string | null;
    pendientes_pull: string | null;
    token: string | null;
  }> {
    const rows = await this.query<{
      last_sync: string | null;
      pendiente_reset: number;
      servidor: string | null;
      last_seq: number | null;
      last_push: string | null;
      pendientes_envio: string | null;
      pendientes_pull: string | null;
      token: string | null;
    }>('SELECT last_sync, pendiente_reset, servidor, last_seq, last_push, pendientes_envio, pendientes_pull, token FROM sync_estado WHERE id = 1');
    return rows[0] ?? {
      last_sync: null,
      pendiente_reset: 0,
      servidor: null,
      last_seq: null,
      last_push: null,
      pendientes_envio: null,
      pendientes_pull: null,
      token: null,
    };
  }

  async setSyncEstado(
    cambios: Partial<{
      last_sync: string | null;
      pendiente_reset: number;
      servidor: string | null;
      last_seq: number | null;
      last_push: string | null;
      pendientes_envio: string | null;
      pendientes_pull: string | null;
      token: string | null;
    }>,
  ): Promise<void> {
    const actual = await this.getSyncEstado();
    const nuevo = { ...actual, ...cambios };
    await this.run(
      'INSERT OR REPLACE INTO sync_estado (id, last_sync, pendiente_reset, servidor, last_seq, last_push, pendientes_envio, pendientes_pull, token) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        nuevo.last_sync,
        nuevo.pendiente_reset,
        nuevo.servidor,
        nuevo.last_seq,
        nuevo.last_push,
        nuevo.pendientes_envio,
        nuevo.pendientes_pull,
        nuevo.token,
      ],
    );
    // Copia en localStorage para sobrevivir a un restablecimiento del almacenamiento local
    if (nuevo.servidor) {
      localStorage.setItem('servidor_sync', nuevo.servidor);
    } else {
      localStorage.removeItem('servidor_sync');
    }
  }

  /**
   * Borra todo el almacenamiento local (base SQLite completa, incluidos
   * usuarios y configuración). La dirección del servidor se conserva para que,
   * al arrancar de nuevo, la app se sincronice y recupere los datos de MySQL.
   * Solo tiene efecto en web; en el dispositivo el equivalente es borrar la app.
   */
  async restablecerAlmacenamiento(): Promise<void> {
    const servidor = localStorage.getItem('servidor_sync');
    localStorage.clear();
    if (servidor) localStorage.setItem('servidor_sync', servidor);
    this.db = undefined;
    const bases = await indexedDB.databases();
    for (const base of bases) {
      if (base.name) indexedDB.deleteDatabase(base.name);
    }
  }
}

function guardadoValido(valor: string | null): valor is string {
  return !!valor && /^https?:\/\//.test(valor);
}
