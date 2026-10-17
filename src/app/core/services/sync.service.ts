import { Injectable, inject } from '@angular/core';
import { SqliteService } from './sqlite.service';

/**
 * Sincronización con el backend (MySQL).
 *
 * La sincronización es 100% manual: solo se ejecuta cuando el usuario
 * presiona "Sincronizar ahora" en Ajustes. Los cambios se acumulan en el
 * SQLite local y viajan en la próxima sincronización.
 *
 * Estrategia:
 *  - Cada fila local tiene un `uuid` global (asignado por triggers) que sirve
 *    de identidad ante el servidor; los ids enteros locales nunca salen de la app.
 *  - Push: se envían las filas con `updated_at` posterior a la marca local
 *    `last_push` (mismo reloj que estampa los triggers, inmune a la diferencia
 *    de hora entre el dispositivo y el servidor).
 *  - Pull: el servidor mantiene un changelog (`cambios`) con secuencia
 *    incremental (`seq`); el cliente solo guarda su cursor `last_seq`, así que
 *    ningún cambio se pierde por diferencias de reloj. Los lotes se paginan.
 *  - El servidor resuelve conflictos por last-write-wins (updated_at).
 *  - Las filas que no pudieron aplicarse (referencias faltantes) se guardan en
 *    `sync_estado` y se reintentan en la siguiente sincronización.
 *  - Las fechas viajan en ISO UTC y se almacenan localmente en formato SQLite UTC.
 */

interface ConfigTabla {
  campos: string[];
  seleccion: string;
  insertar: string;
  actualizar: string;
  fks?: string[];
  /** FKs opcionales que en SQLite se guardan como 0 ("sin registro") y en el
   *  servidor como NULL; al recibir hay que traducir NULL de vuelta a 0. */
  ceros?: string[];
  numericos?: string[];
  booleanos?: string[];
  fechas?: string[];
}

const F = (col: string) => `strftime('%Y-%m-%dT%H:%M:%SZ', ${col})`;

const CONFIG: Record<string, ConfigTabla> = {
  bases: {
    campos: ['fecha', 'base_efectivo', 'base_cuenta', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT b.uuid AS id, b.fecha, b.base_efectivo, b.base_cuenta, u.uuid AS usuario_id,
             CASE WHEN b.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', b.deleted_at) END AS deleted_at,
             ${F('b.created_at')} AS created_at, ${F('b.updated_at')} AS updated_at
      FROM bases b LEFT JOIN usuarios u ON u.id = b.usuario_id
      WHERE b.updated_at > ?`,
    insertar: 'INSERT INTO bases (uuid, fecha, base_efectivo, base_cuenta, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE bases SET fecha = ?, base_efectivo = ?, base_cuenta = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['usuario_id'],
    numericos: ['base_efectivo', 'base_cuenta'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  categorias: {
    campos: ['nombre', 'descripcion', 'usuario_id', 'created_at', 'updated_at'],
    seleccion: `
      SELECT c.uuid AS id, c.nombre, c.descripcion, u.uuid AS usuario_id,
             ${F('c.created_at')} AS created_at, ${F('c.updated_at')} AS updated_at
      FROM categorias c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.updated_at > ?`,
    insertar: 'INSERT INTO categorias (uuid, nombre, descripcion, usuario_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE categorias SET nombre = ?, descripcion = ?, usuario_id = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['usuario_id'],
  },
  proveedores: {
    campos: ['nombre', 'contacto', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT p.uuid AS id, p.nombre, p.contacto, u.uuid AS usuario_id,
             CASE WHEN p.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', p.deleted_at) END AS deleted_at,
             ${F('p.created_at')} AS created_at, ${F('p.updated_at')} AS updated_at
      FROM proveedores p LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.updated_at > ?`,
    insertar: 'INSERT INTO proveedores (uuid, nombre, contacto, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE proveedores SET nombre = ?, contacto = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['usuario_id'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  clientes: {
    campos: ['nombre', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT c.uuid AS id, c.nombre, u.uuid AS usuario_id,
             CASE WHEN c.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', c.deleted_at) END AS deleted_at,
             ${F('c.created_at')} AS created_at, ${F('c.updated_at')} AS updated_at
      FROM clientes c LEFT JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.updated_at > ?`,
    insertar: 'INSERT INTO clientes (uuid, nombre, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE clientes SET nombre = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['usuario_id'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  productos: {
    campos: [
      'codigo', 'nombre', 'descripcion', 'categoria_id', 'unidad',
      'precio_compra', 'precio_venta', 'stock', 'stock_minimo',
      'activo', 'usuario_id', 'deleted_at', 'created_at', 'updated_at',
    ],
    seleccion: `
      SELECT p.uuid AS id, c.uuid AS categoria_id, p.codigo, p.nombre, p.descripcion, p.unidad,
             p.precio_compra, p.precio_venta, p.stock, p.stock_minimo, p.activo,
             u.uuid AS usuario_id,
             CASE WHEN p.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', p.deleted_at) END AS deleted_at,
             ${F('p.created_at')} AS created_at, ${F('p.updated_at')} AS updated_at
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.updated_at > ?`,
    insertar: `INSERT INTO productos
        (uuid, codigo, nombre, descripcion, categoria_id, unidad, precio_compra, precio_venta,
         stock, stock_minimo, activo, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE productos SET
         codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?, unidad = ?,
         precio_compra = ?, precio_venta = ?, stock = ?, stock_minimo = ?,
         activo = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['categoria_id', 'usuario_id'],
    numericos: ['precio_compra', 'precio_venta', 'stock', 'stock_minimo'],
    booleanos: ['activo'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  presentaciones: {
    campos: ['producto_id', 'nombre', 'factor', 'precio_venta', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT pr.uuid AS id, p.uuid AS producto_id, pr.nombre, pr.factor, pr.precio_venta,
             us.uuid AS usuario_id,
             CASE WHEN pr.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', pr.deleted_at) END AS deleted_at,
             ${F('pr.created_at')} AS created_at, ${F('pr.updated_at')} AS updated_at
      FROM presentaciones pr
      JOIN productos p ON p.id = pr.producto_id
      LEFT JOIN usuarios us ON us.id = pr.usuario_id
      WHERE pr.updated_at > ?`,
    insertar: `INSERT INTO presentaciones (uuid, producto_id, nombre, factor, precio_venta, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE presentaciones SET producto_id = ?, nombre = ?, factor = ?, precio_venta = ?,
         usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['producto_id', 'usuario_id'],
    numericos: ['factor', 'precio_venta'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  lotes: {
    campos: ['producto_id', 'cantidad_inicial', 'cantidad_restante', 'costo_unitario', 'usuario_id', 'created_at', 'updated_at'],
    seleccion: `
      SELECT l.uuid AS id, pr.uuid AS producto_id, l.cantidad_inicial, l.cantidad_restante, l.costo_unitario,
             us.uuid AS usuario_id,
             ${F('l.created_at')} AS created_at, ${F('l.updated_at')} AS updated_at
      FROM lotes l
      JOIN productos pr ON pr.id = l.producto_id
      LEFT JOIN usuarios us ON us.id = l.usuario_id
      WHERE l.updated_at > ?`,
    insertar: `INSERT INTO lotes (uuid, producto_id, cantidad_inicial, cantidad_restante, costo_unitario, usuario_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE lotes SET producto_id = ?, cantidad_inicial = ?, cantidad_restante = ?, costo_unitario = ?, usuario_id = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['producto_id', 'usuario_id'],
    numericos: ['cantidad_inicial', 'cantidad_restante', 'costo_unitario'],
    fechas: ['created_at', 'updated_at'],
  },
  movimientos: {
    campos: ['producto_id', 'tipo', 'cantidad', 'motivo', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT m.uuid AS id, p.uuid AS producto_id, m.tipo, m.cantidad, m.motivo,
             us.uuid AS usuario_id,
             CASE WHEN m.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', m.deleted_at) END AS deleted_at,
             ${F('m.created_at')} AS created_at, ${F('m.updated_at')} AS updated_at
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN usuarios us ON us.id = m.usuario_id
      WHERE m.updated_at > ?`,
    insertar: `INSERT INTO movimientos (uuid, producto_id, tipo, cantidad, motivo, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE movimientos SET producto_id = ?, tipo = ?, cantidad = ?, motivo = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['producto_id', 'usuario_id'],
    numericos: ['cantidad'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  compras: {
    campos: ['proveedor_id', 'total', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT co.uuid AS id, pv.uuid AS proveedor_id, co.total, us.uuid AS usuario_id,
             CASE WHEN co.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', co.deleted_at) END AS deleted_at,
             ${F('co.created_at')} AS created_at, ${F('co.updated_at')} AS updated_at
      FROM compras co
      JOIN proveedores pv ON pv.id = co.proveedor_id
      LEFT JOIN usuarios us ON us.id = co.usuario_id
      WHERE co.updated_at > ?`,
    insertar: 'INSERT INTO compras (uuid, proveedor_id, total, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE compras SET proveedor_id = ?, total = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['proveedor_id', 'usuario_id'],
    numericos: ['total'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  compra_detalle: {
    campos: ['compra_id', 'producto_id', 'cantidad', 'costo_unitario', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT d.uuid AS id, co.uuid AS compra_id, p.uuid AS producto_id, d.cantidad, d.costo_unitario,
             us.uuid AS usuario_id,
             CASE WHEN d.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', d.deleted_at) END AS deleted_at,
             ${F('d.created_at')} AS created_at, ${F('d.updated_at')} AS updated_at
      FROM compra_detalle d
      JOIN compras co ON co.id = d.compra_id
      JOIN productos p ON p.id = d.producto_id
      LEFT JOIN usuarios us ON us.id = d.usuario_id
      WHERE d.updated_at > ?`,
    insertar: `INSERT INTO compra_detalle (uuid, compra_id, producto_id, cantidad, costo_unitario, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE compra_detalle SET compra_id = ?, producto_id = ?, cantidad = ?, costo_unitario = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['compra_id', 'producto_id', 'usuario_id'],
    numericos: ['cantidad', 'costo_unitario'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  ventas: {
    campos: ['total', 'ganancia', 'metodo_pago', 'nota', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT v.uuid AS id, v.total, v.ganancia, v.metodo_pago, v.nota, u.uuid AS usuario_id,
             CASE WHEN v.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', v.deleted_at) END AS deleted_at,
             ${F('v.created_at')} AS created_at, ${F('v.updated_at')} AS updated_at
      FROM ventas v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.updated_at > ?`,
    insertar: `INSERT INTO ventas (uuid, total, ganancia, metodo_pago, nota, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE ventas SET total = ?, ganancia = ?, metodo_pago = ?, nota = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    numericos: ['total', 'ganancia'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
    fks: ['usuario_id'],
  },
  venta_pagos: {
    campos: ['venta_id', 'metodo', 'monto', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT vp.uuid AS id, v.uuid AS venta_id, vp.metodo, vp.monto,
             us.uuid AS usuario_id,
             CASE WHEN vp.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', vp.deleted_at) END AS deleted_at,
             ${F('vp.created_at')} AS created_at, ${F('vp.updated_at')} AS updated_at
      FROM venta_pagos vp
      JOIN ventas v ON v.id = vp.venta_id
      LEFT JOIN usuarios us ON us.id = vp.usuario_id
      WHERE vp.updated_at > ?`,
    insertar: `INSERT INTO venta_pagos (uuid, venta_id, metodo, monto, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE venta_pagos SET venta_id = ?, metodo = ?, monto = ?, usuario_id = ?,
         deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['venta_id', 'usuario_id'],
    numericos: ['monto'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  venta_detalle: {
    campos: ['venta_id', 'producto_id', 'lote_id', 'cantidad', 'precio_unitario', 'costo_unitario', 'presentacion_nombre', 'presentacion_factor', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT d.uuid AS id, v.uuid AS venta_id, p.uuid AS producto_id, l.uuid AS lote_id,
             d.cantidad, d.precio_unitario, d.costo_unitario,
             d.presentacion_nombre, d.presentacion_factor,
             us.uuid AS usuario_id,
             CASE WHEN d.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', d.deleted_at) END AS deleted_at,
             ${F('d.created_at')} AS created_at, ${F('d.updated_at')} AS updated_at
      FROM venta_detalle d
      JOIN ventas v ON v.id = d.venta_id
      JOIN productos p ON p.id = d.producto_id
      JOIN lotes l ON l.id = d.lote_id
      LEFT JOIN usuarios us ON us.id = d.usuario_id
      WHERE d.updated_at > ?`,
    insertar: `INSERT INTO venta_detalle (uuid, venta_id, producto_id, lote_id, cantidad, precio_unitario, costo_unitario, presentacion_nombre, presentacion_factor, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE venta_detalle SET venta_id = ?, producto_id = ?, lote_id = ?, cantidad = ?,
         precio_unitario = ?, costo_unitario = ?, presentacion_nombre = ?, presentacion_factor = ?,
         usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['venta_id', 'producto_id', 'lote_id', 'usuario_id'],
    numericos: ['cantidad', 'precio_unitario', 'costo_unitario'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  cuentas_cobrar: {
    campos: ['venta_id', 'cliente_id', 'concepto', 'total', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT cc.uuid AS id,
             CASE WHEN cc.venta_id = 0 THEN NULL ELSE v.uuid END AS venta_id,
             cl.uuid AS cliente_id, cc.concepto, cc.total,
             u.uuid AS usuario_id,
             CASE WHEN cc.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', cc.deleted_at) END AS deleted_at,
             ${F('cc.created_at')} AS created_at, ${F('cc.updated_at')} AS updated_at
      FROM cuentas_cobrar cc
      JOIN clientes cl ON cl.id = cc.cliente_id
      LEFT JOIN ventas v ON v.id = cc.venta_id
      LEFT JOIN usuarios u ON u.id = cc.usuario_id
      WHERE cc.updated_at > ?`,
    insertar: `INSERT INTO cuentas_cobrar (uuid, venta_id, cliente_id, concepto, total, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE cuentas_cobrar SET venta_id = ?, cliente_id = ?, concepto = ?, total = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['venta_id', 'cliente_id', 'usuario_id'],
    ceros: ['venta_id'],
    numericos: ['total'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  abonos_cobrar: {
    campos: ['cuenta_id', 'valor', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT a.uuid AS id, c.uuid AS cuenta_id, a.valor, us.uuid AS usuario_id,
             CASE WHEN a.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', a.deleted_at) END AS deleted_at,
             ${F('a.created_at')} AS created_at, ${F('a.updated_at')} AS updated_at
      FROM abonos_cobrar a
      JOIN cuentas_cobrar c ON c.id = a.cuenta_id
      LEFT JOIN usuarios us ON us.id = a.usuario_id
      WHERE a.updated_at > ?`,
    insertar: 'INSERT INTO abonos_cobrar (uuid, cuenta_id, valor, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE abonos_cobrar SET cuenta_id = ?, valor = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['cuenta_id', 'usuario_id'],
    numericos: ['valor'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  cuentas_pagar: {
    campos: ['compra_id', 'proveedor_id', 'concepto', 'total', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT cp.uuid AS id,
             CASE WHEN cp.compra_id = 0 THEN NULL ELSE co.uuid END AS compra_id,
             pv.uuid AS proveedor_id, cp.concepto, cp.total, u.uuid AS usuario_id,
             CASE WHEN cp.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', cp.deleted_at) END AS deleted_at,
             ${F('cp.created_at')} AS created_at, ${F('cp.updated_at')} AS updated_at
      FROM cuentas_pagar cp
      JOIN proveedores pv ON pv.id = cp.proveedor_id
      LEFT JOIN compras co ON co.id = cp.compra_id
      LEFT JOIN usuarios u ON u.id = cp.usuario_id
      WHERE cp.updated_at > ?`,
    insertar: `INSERT INTO cuentas_pagar (uuid, compra_id, proveedor_id, concepto, total, usuario_id, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actualizar: `UPDATE cuentas_pagar SET compra_id = ?, proveedor_id = ?, concepto = ?, total = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ?
       WHERE id = ?`,
    fks: ['compra_id', 'proveedor_id', 'usuario_id'],
    ceros: ['compra_id'],
    numericos: ['total'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  pagos_pagar: {
    campos: ['cuenta_id', 'valor', 'usuario_id', 'deleted_at', 'created_at', 'updated_at'],
    seleccion: `
      SELECT pg.uuid AS id, c.uuid AS cuenta_id, pg.valor, us.uuid AS usuario_id,
             CASE WHEN pg.deleted_at IS NULL THEN NULL
                  ELSE strftime('%Y-%m-%dT%H:%M:%SZ', pg.deleted_at) END AS deleted_at,
             ${F('pg.created_at')} AS created_at, ${F('pg.updated_at')} AS updated_at
      FROM pagos_pagar pg
      JOIN cuentas_pagar c ON c.id = pg.cuenta_id
      LEFT JOIN usuarios us ON us.id = pg.usuario_id
      WHERE pg.updated_at > ?`,
    insertar: 'INSERT INTO pagos_pagar (uuid, cuenta_id, valor, usuario_id, deleted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE pagos_pagar SET cuenta_id = ?, valor = ?, usuario_id = ?, deleted_at = ?, created_at = ?, updated_at = ? WHERE id = ?',
    fks: ['cuenta_id', 'usuario_id'],
    numericos: ['valor'],
    fechas: ['created_at', 'updated_at', 'deleted_at'],
  },
  usuarios: {
    campos: ['usuario', 'nombre', 'clave_hash', 'rol', 'activo', 'created_at', 'updated_at'],
    seleccion: `
      SELECT us.uuid AS id, us.usuario, us.nombre, us.clave_hash, us.rol, us.activo,
             ${F('us.created_at')} AS created_at, ${F('us.updated_at')} AS updated_at
      FROM usuarios us WHERE us.updated_at > ?`,
    insertar: 'INSERT INTO usuarios (uuid, usuario, nombre, clave_hash, rol, activo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    actualizar: 'UPDATE usuarios SET usuario = ?, nombre = ?, clave_hash = ?, rol = ?, activo = ?, created_at = ?, updated_at = ? WHERE id = ?',
    booleanos: ['activo'],
    fechas: ['created_at', 'updated_at'],
  },
};

/** Orden de aplicación: usuarios primero (las demás tablas lo referencian),
 *  luego padres antes que hijos (coincide con el servidor). */
const ORDEN_TABLAS = ['usuarios', ...Object.keys(CONFIG).filter((t) => t !== 'usuarios')];

/** Tabla padre a la que apunta cada llave foránea de cada tabla. */
const TABLA_FK: Record<string, Record<string, string>> = {
  bases: { usuario_id: 'usuarios' },
  categorias: { usuario_id: 'usuarios' },
  proveedores: { usuario_id: 'usuarios' },
  clientes: { usuario_id: 'usuarios' },
  productos: { categoria_id: 'categorias', usuario_id: 'usuarios' },
  presentaciones: { producto_id: 'productos', usuario_id: 'usuarios' },
  lotes: { producto_id: 'productos', usuario_id: 'usuarios' },
  movimientos: { producto_id: 'productos', usuario_id: 'usuarios' },
  compras: { proveedor_id: 'proveedores', usuario_id: 'usuarios' },
  compra_detalle: { compra_id: 'compras', producto_id: 'productos', usuario_id: 'usuarios' },
  ventas: { usuario_id: 'usuarios' },
  venta_pagos: { venta_id: 'ventas', usuario_id: 'usuarios' },
  venta_detalle: { venta_id: 'ventas', producto_id: 'productos', lote_id: 'lotes', usuario_id: 'usuarios' },
  cuentas_cobrar: { venta_id: 'ventas', cliente_id: 'clientes', usuario_id: 'usuarios' },
  abonos_cobrar: { cuenta_id: 'cuentas_cobrar', usuario_id: 'usuarios' },
  cuentas_pagar: { compra_id: 'compras', proveedor_id: 'proveedores', usuario_id: 'usuarios' },
  pagos_pagar: { cuenta_id: 'cuentas_pagar', usuario_id: 'usuarios' },
  usuarios: {},
};

export interface ResultadoSync {
  enviados: number;
  recibidos: number;
  errores: number;
  pendientes: number;
}

/** Respuesta del backend: lote de cambios paginado por cursor. */
interface RespuestaSync {
  server_time: string;
  last_seq: number;
  hasMore: boolean;
  fallidos?: Record<string, string[]>;
  changes: Record<string, Record<string, unknown>[]>;
}

/** Fecha UTC actual en formato SQLite (la misma que estampa updated_at). */
function sqliteFechaAhora(): string {
  return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly sqlite = inject(SqliteService);
  private ocupado = false;

  private readonly log = console.log;

  private logError(...args: unknown[]): void {
    console.error('[sync]', ...args);
  }

  /** Convierte fecha ISO del servidor a formato SQLite UTC. */
  private fechaIsoASqlite(valor: unknown): string | null {
    if (!valor || typeof valor !== 'string') return null;
    return valor.replace('T', ' ').replace(/(\.\d+)?Z$/, '');
  }

  /** Fecha UTC actual en formato SQLite (el mismo reloj que estampa updated_at). */
  private sqliteFechaAhora(): string {
    return new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  }

  /** Misma consulta de selección de una tabla, pero filtrando por uuid exacto
   *  (sin importar updated_at), para el cierre de referencias. */
  private seleccionPorUuid(tabla: string): string {
    return CONFIG[tabla].seleccion.replace(
      /WHERE (\w+)\.updated_at > \?/,
      'WHERE $1.uuid = ?',
    );
  }

  private convertirCampo(
    campo: string,
    valor: unknown,
    cfg: ConfigTabla,
    mapaFks: Map<string, number>,
  ): unknown {
    if (cfg.fks?.includes(campo)) {
      if (valor == null) {
        // "Sin registro": en el servidor es NULL, en SQLite se guarda 0
        // (la columna es NOT NULL; p. ej. cuentas_cobrar.venta_id).
        if (cfg.ceros?.includes(campo)) return 0;
        return null;
      }
      const localId = mapaFks.get(String(valor));
      if (localId == null) {
        // usuario_id es auditoría (quién creó la fila): si la referencia no
        // existe aún localmente, la fila se aplica sin él en vez de omitirse
        // completa. Las FKs de negocio sí son estrictas.
        if (campo === 'usuario_id') return null;
        throw new Error(`Referencia no encontrada para ${campo}`);
      }
      return localId;
    }
    if (cfg.numericos?.includes(campo)) return Number(valor ?? 0);
    if (cfg.booleanos?.includes(campo)) {
      // Campo ausente en el servidor (backend antiguo): no desactivar la fila
      if (valor == null) return 1;
      return valor ? 1 : 0;
    }
    if (cfg.fechas?.includes(campo)) return this.fechaIsoASqlite(valor);
    return valor ?? null;
  }

  /**
   * Aplica las filas que llegan del servidor (crear o actualizar por uuid).
   * Devuelve los uuid que no pudieron aplicarse (p. ej. referencia faltante)
   * para reintentarlos en la siguiente sincronización.
   */
  private async aplicarTabla(
    tabla: string,
    filas: Record<string, unknown>[],
  ): Promise<{ aplicados: number; fallidos: string[] }> {
    const cfg = CONFIG[tabla];
    const pares = await this.sqlite.consultar<{ id: number; uuid: string }>(
      `SELECT id, uuid FROM ${tabla} WHERE uuid IS NOT NULL`,
    );
    const porUuid = new Map(pares.map((p) => [p.uuid, p.id]));
    // Resuelve las llaves foráneas de las filas entrantes contra las tablas
    // padre (p. ej. el usuario_id de un producto creado en otro dispositivo).
    const mapaFks = new Map<string, number>();
    for (const tablaPadre of Object.values(TABLA_FK[tabla] ?? {})) {
      const padres = await this.sqlite.consultar<{ id: number; uuid: string }>(
        `SELECT id, uuid FROM ${tablaPadre} WHERE uuid IS NOT NULL`,
      );
      for (const p of padres) mapaFks.set(p.uuid, p.id);
    }
    let aplicados = 0;
    const fallidos: string[] = [];

    for (const fila of filas) {
      const uuid = fila?.['id'];
      if (!fila || typeof uuid !== 'string') continue;
      try {
        const valores = cfg.campos.map((c) => this.convertirCampo(c, fila[c], cfg, mapaFks));
        const localId = porUuid.get(uuid);
        if (localId != null) {
          await this.sqlite.ejecutar(cfg.actualizar, [...valores, localId]);
        } else {
          // El mismo usuario puede existir localmente y en el servidor con
          // uuid distinto (sembrado en ambos lados, p. ej. el admin): se
          // adopta la identidad del servidor en vez de crear un duplicado.
          if (tabla === 'usuarios' && typeof fila['usuario'] === 'string') {
            const dueno = await this.sqlite.consultar<{ id: number }>(
              'SELECT id FROM usuarios WHERE usuario = ?',
              [fila['usuario']],
            );
            if (dueno[0]) {
              await this.sqlite.ejecutar('UPDATE usuarios SET uuid = ? WHERE id = ?', [
                uuid,
                dueno[0].id,
              ]);
              porUuid.set(uuid, dueno[0].id);
              await this.sqlite.ejecutar(cfg.actualizar, [...valores, dueno[0].id]);
              aplicados++;
              continue;
            }
          }
          await this.sqlite.ejecutar(cfg.insertar, [uuid, ...valores]);
          const nuevo = await this.sqlite.consultar<{ id: number }>(
            `SELECT id FROM ${tabla} WHERE uuid = ?`,
            [uuid],
          );
          if (nuevo[0]) porUuid.set(uuid, nuevo[0].id);
        }
        aplicados++;
      } catch (error) {
        this.logError(`Fila omitida en ${tabla}`, { uuid, error });
        fallidos.push(uuid);
      }
    }
    return { aplicados, fallidos };
  }

  async sincronizar(): Promise<ResultadoSync> {
    if (this.ocupado) throw new Error('Ya hay una sincronización en curso');
    this.ocupado = true;
    try {
      const estado = await this.sqlite.getSyncEstado();
      if (!estado.servidor) {
        throw new Error('Configura la dirección del servidor en Ajustes');
      }

      // Marca de corte capturada ANTES de recolectar: las filas modificadas
      // durante la sync quedan para la siguiente. Usa el reloj local (el mismo
      // que estampa updated_at), por lo que la hora del servidor es irrelevante.
      const marca = this.sqliteFechaAhora();
      const desde = estado.last_push ?? '1970-01-01 00:00:00';

      const cambios: Record<string, Record<string, unknown>[]> = {};
      let enviados = 0;
      // Reintentos: filas que el servidor no pudo aplicar en la sync anterior
      // (referencias faltantes de su lado) viajan de nuevo en este push.
      if (estado.pendientes_envio) {
        const pendientes = JSON.parse(estado.pendientes_envio) as Record<string, string[]>;
        for (const [tabla, uuids] of Object.entries(pendientes)) {
          for (const uuid of uuids) {
            const fila = await this.sqlite.consultar<Record<string, unknown>>(
              this.seleccionPorUuid(tabla),
              [uuid],
            );
            if (fila[0] && !cambios[tabla]?.some((f) => f['id'] === uuid)) {
              (cambios[tabla] ??= []).push(fila[0]);
              enviados++;
            }
          }
        }
      }

      for (const tabla of ORDEN_TABLAS) {
        let filas: Record<string, unknown>[];
        try {
          filas = await this.sqlite.consultar<Record<string, unknown>>(
            CONFIG[tabla].seleccion,
            [desde],
          );
        } catch (error) {
          this.logError(`Error consultando cambios locales de ${tabla}`, error);
          throw error;
        }
        if (filas.length > 0) {
          cambios[tabla] = filas;
          enviados += filas.length;
          this.log(`Enviando ${tabla}: ${filas.length} fila(s)`);
        }
      }

      // Cierre de referencias: incluye las filas padre (usuarios, categorías,
      // proveedores, etc.) que las filas a enviar referencian, aunque no hayan
      // cambiado desde la última sync. Así el servidor nunca recibe una fila
      // huérfana (p. ej. una compra cuyo proveedor nunca se sincronizó).
      const incluidos = new Set<string>();
      for (const tabla of ORDEN_TABLAS) {
        for (const fila of cambios[tabla] ?? []) {
          if (typeof fila['id'] === 'string') incluidos.add(`${tabla}:${fila['id']}`);
        }
      }
      let referencias = 0;
      for (let pasada = 0; pasada < 5; pasada++) {
        let nuevos = 0;
        for (const tabla of ORDEN_TABLAS) {
          for (const fila of cambios[tabla] ?? []) {
            for (const [campo, tablaPadre] of Object.entries(TABLA_FK[tabla] ?? {})) {
              const uuid = fila[campo];
              if (uuid == null || typeof uuid !== 'string') continue;
              const clave = `${tablaPadre}:${uuid}`;
              if (incluidos.has(clave)) continue;
              incluidos.add(clave);
              const padre = await this.sqlite.consultar<Record<string, unknown>>(
                this.seleccionPorUuid(tablaPadre),
                [uuid],
              );
              if (padre[0]) {
                (cambios[tablaPadre] ??= []).push(padre[0]);
                enviados++;
                nuevos++;
              }
            }
          }
        }
        if (nuevos === 0) break;
        referencias += nuevos;
      }
      if (referencias > 0) this.log(`Referencias incluidas: ${referencias} fila(s)`);

      const url = `${estado.servidor.replace(/\/+$/, '')}/api/sync`;
      const encabezados: Record<string, string> = { 'Content-Type': 'application/json' };
      if (estado.token) encabezados['x-sync-token'] = estado.token;

      let lastSeq = estado.last_seq ?? null;
      let recibidos = 0;
      let serverTime: string | null = null;
      let fallidosServidor: Record<string, string[]> = {};
      const fallidosPull: Record<string, string[]> = {};

      // Pull paginado: mientras el servidor indique hasMore, se pide el
      // siguiente lote con el cursor devuelto.
      for (let lote = 0; ; lote++) {
        const cuerpo: Record<string, unknown> = {
          last_seq: lastSeq,
          changes: lote === 0 ? cambios : {},
        };
        if (lote === 0 && estado.pendientes_pull) {
          const pendientes = JSON.parse(estado.pendientes_pull) as Record<string, string[]>;
          if (Object.keys(pendientes).length > 0) cuerpo['reintentar'] = pendientes;
        }
        const respuesta = await fetch(url, {
          method: 'POST',
          headers: encabezados,
          body: JSON.stringify(cuerpo),
        });
        if (!respuesta.ok) {
          const texto = await respuesta.text();
          this.logError('Cuerpo del error del servidor', texto);
          throw new Error(`El servidor respondió con error ${respuesta.status}`);
        }
        const data = (await respuesta.json()) as RespuestaSync;
        lastSeq = data.last_seq;
        fallidosServidor = data.fallidos ?? {};

        for (const tabla of ORDEN_TABLAS) {
          const filas = data.changes?.[tabla];
          if (Array.isArray(filas) && filas.length > 0) {
            const resultado = await this.aplicarTabla(tabla, filas);
            recibidos += resultado.aplicados;
            for (const uuid of resultado.fallidos) {
              (fallidosPull[tabla] ??= []).push(uuid);
            }
            this.log(`Recibidas ${tabla}: ${filas.length} fila(s), aplicadas ${resultado.aplicados}`);
          }
        }
        if (!data.hasMore) {
          serverTime = data.server_time;
          break;
        }
      }

      const pendientes = Object.values(fallidosServidor).reduce((n, u) => n + u.length, 0);
      await this.sqlite.setSyncEstado({
        last_sync: this.fechaIsoASqlite(serverTime),
        last_seq: lastSeq,
        last_push: marca,
        pendientes_envio: JSON.stringify(fallidosServidor),
        pendientes_pull: JSON.stringify(fallidosPull),
        pendiente_reset: 0,
      });
      this.log('Sincronización completada', { enviados, recibidos, last_seq: lastSeq });
      return { enviados, recibidos, errores: 0, pendientes };
    } catch (error) {
      this.logError('Sincronización falló', error);
      throw error;
    } finally {
      this.ocupado = false;
    }
  }
}
