# Plan de Desarrollo — InventoryMovil

Aplicación móvil (Ionic + Angular + Capacitor + SQLite) para manejo de negocio:
inventario, ventas, compras, cuentas por cobrar/pagar y utilidades.

## Arquitectura y estructura de carpetas

```
src/app/
├── core/                      # Lógica de negocio (sin UI)
│   ├── models/                # Interfaces TypeScript (Producto, Venta, ...)
│   ├── services/              # SqliteService, AuthService, ToastService, ...
│   └── constants/             # Rutas, definición de módulos del home
├── shared/                    # Componentes y utilidades reutilizables
│   ├── components/
│   │   ├── module-button/     # Botón circular con icono + nombre (home)
│   │   ├── page-header/       # Encabezado estándar de páginas
│   │   ├── empty-state/       # Mensaje "sin datos" con icono
│   │   ├── search-bar/        # Barra de búsqueda reutilizable
│   │   └── list-item/         # Fila estándar de listados
│   ├── pipes/                 # moneda, fechaCorta
│   └── guards/                # authGuard
└── pages/                     # Una carpeta por módulo (lazy loading)
    ├── auth/login/
    ├── home/
    ├── productos/
    ├── inventario/
    ├── ventas/
    ├── compras/
    ├── cuentas-por-cobrar/
    ├── cuentas-por-pagar/
    └── reportes/
```

Principios:
- **Lazy loading**: cada página se carga por ruta independiente.
- **Reutilización**: todo patrón repetido (botón de módulo, encabezado, búsqueda,
  listas vacías, diálogos de confirmación) vive en `shared/`.
- **Un servicio por dominio**: `ProductoService`, `VentaService`, etc. usan el
  `SqliteService` como capa de acceso a datos (query/run).
- **Signals** para estado de UI (Angular zoneless ya configurado).

## Fases de desarrollo (módulo a módulo)

### Fase 0 — Base del proyecto ✅ (completada)
Ionic 9 + Angular 20 + Capacitor 8 + SQLite (nativo y web con jeep-sqlite).
Esquema inicial: `categorias`, `productos`, `movimientos`. Build y lint OK.

### Fase 1 — Autenticación
- Tabla `usuarios` (usuario, contraseña con hash, nombre, rol).
- `AuthService` + sesión persistida (SQLite).
- Página de **login** y `authGuard` que protege todas las rutas internas.
- Logout desde el home.

### Fase 2 — Home (menú principal)
- Grid de **botones circulares con icono centrado y nombre del módulo debajo**:
  Ventas, Compras, Productos, Inventario, Cuentas por Cobrar, Cuentas por
  Pagar, Reportes, Ajustes.
- Componente reutilizable `module-button` (color e icono configurables).
- Definición de módulos en `core/constants/modules.ts` (única fuente de verdad).
- Navegación a rutas de módulos (páginas placeholder al inicio).

### Fase 3 — Productos y categorías
- CRUD completo de productos (nombre, categoría, precios, stock, stock mínimo,
  unidad). El código se genera automáticamente (P-0001, P-0002...).
- CRUD de categorías.
- Búsqueda y formulario con validaciones.
- Al crear un producto con cantidad inicial se genera su **lote inicial**
  (costo = precio de compra del formulario).

### Fase 4 — Inventario
- Listado con stock actual y alerta de stock bajo el mínimo.
- Ajustes de inventario (entradas/salidas manuales → tabla `movimientos`).
- Historial de movimientos por producto.
- Consulta de lotes por producto (cantidad restante y costo de cada lote).

### Fase 5 — Ventas
- Nueva venta: selección de productos, cantidades, total.
- **Consumo FIFO de lotes**: cada línea de venta descuenta primero el lote más
  antiguo; si cruza varios lotes se generan filas de detalle por lote, cada una
  con su `costo_unitario` (snapshot de la ganancia real).
- Descuento automático de stock + registro de movimientos.
- Historial de ventas con detalle y ganancia por venta.

### Fase 6 — Compras
- Nueva compra a proveedor (tabla `proveedores`).
- **Cada línea de factura crea un lote** (cantidad + costo unitario de esa
  factura) → el costo del producto queda amarrado al valor real de cada factura.
- Incremento automático de stock + registro de movimientos.
- Historial de compras con detalle.

### Fase 7 — Cuentas por cobrar
- Ventas a crédito con saldo pendiente (tabla `pagos_cobrar`).
- Registro de abonos y listado de saldos.

### Fase 8 — Cuentas por pagar
- Compras a crédito con saldo pendiente (tabla `pagos_pagar`).
- Registro de pagos y listado de saldos.

### Fase 9 — Reportes y utilidades
- Resumen del negocio (ventas del día/mes, top productos, deudas).
- Respaldo/exportación de la base de datos.

### Fase 10 — Pulido final
- Icono y splash screen de la app.
- Validaciones de borde, estados de carga, pruebas.

## Esquema de base de datos (tablas nuevas por fase)

| Fase | Tablas |
|------|--------|
| 1 | `usuarios` |
| 3 | `lotes` |
| 5 | `ventas`, `venta_detalle` (con `costo_unitario` por lote) |
| 6 | `proveedores`, `compras`, `compra_detalle` |
| 7 | `pagos_cobrar` |
| 8 | `pagos_pagar` |

## Costeo FIFO por lotes (decisión de diseño)

El costo de un producto **no es único**: cada factura de compra crea un lote con
su propio costo. La ganancia real se calcula contra el costo del lote que
realmente se vendió.

**Tabla `lotes`**: id, producto_id, cantidad_inicial, cantidad_restante,
costo_unitario, created_at.

**Reglas:**
1. **Crear producto con cantidad inicial** → lote inicial (costo = costo
   unitario de apertura del formulario). El precio de venta no se define en el
   producto: cada venta lleva su propio precio.
2. **Registrar compra** → cada línea de la factura crea un lote con el costo
   unitario de esa factura.
3. **Vender** → se consume primero el lote más antiguo con cantidad restante;
   si la venta cruza varios lotes, el detalle de la venta genera una fila por
   lote con su costo (snapshot). `ganancia = precio_venta − costo_lote`.
4. **Stock del producto** = suma de `cantidad_restante` de sus lotes.
5. **Valor del inventario** = Σ (cantidad_restante × costo_unitario) por lote.
6. **Precio de compra del producto** = costo del lote más reciente (referencia,
   calculado por el sistema, no editable a mano).
7. **Eliminar producto** → bloqueado si tiene lotes con cantidad restante o
   movimientos relacionados.
8. **Anular/devolver venta** (futuro) → las cantidades regresan a su lote
   original (el detalle guarda el `lote_id`).

## Flujo de trabajo por módulo

1. Modelo + servicio de dominio (SQLite).
2. Páginas del módulo (lista → detalle/formulario) con componentes shared.
3. Integración en el home y rutas.
4. `npm run build` + `npx cap sync android` + verificación en navegador.
