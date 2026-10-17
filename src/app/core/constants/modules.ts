export interface AppModule {
  id: string;
  nombre: string;
  icono: string;
  color: string;
  ruta: string;
}

export const MODULES: AppModule[] = [
  { id: 'ventas', nombre: 'Ventas', icono: 'ms:shopping_cart', color: 'var(--ion-color-success)', ruta: '/ventas' },
  { id: 'compras', nombre: 'Compras', icono: 'ms:shopping_bag', color: 'var(--ion-color-danger)', ruta: '/compras' },
  { id: 'productos', nombre: 'Productos', icono: 'ms:inventory_2', color: '#f8f500', ruta: '/productos' },
  { id: 'inventario', nombre: 'Inventario', icono: 'ms:inventory', color: '#f8f500', ruta: '/inventario' },
  { id: 'cuentas-por-cobrar', nombre: 'Cuentas por Cobrar', icono: 'ms:account_balance_wallet', color: 'var(--ion-color-success)', ruta: '/cuentas-por-cobrar' },
  { id: 'cuentas-por-pagar', nombre: 'Cuentas por Pagar', icono: 'ms:credit_card', color: 'var(--ion-color-danger)', ruta: '/cuentas-por-pagar' },
  { id: 'bases', nombre: 'Bases', icono: 'ms:savings', color: 'var(--ion-color-primary)', ruta: '/bases' },
  { id: 'reportes', nombre: 'Reportes', icono: 'ms:bar_chart', color: '#f8f500', ruta: '/reportes' },
  { id: 'usuarios', nombre: 'Usuarios', icono: 'ms:manage_accounts', color: 'var(--ion-color-primary)', ruta: '/usuarios' },
  { id: 'ajustes', nombre: 'Ajustes', icono: 'ms:settings', color: 'var(--ion-color-danger)', ruta: '/ajustes' },
];
