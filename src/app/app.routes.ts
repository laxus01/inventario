import { Routes } from '@angular/router';
import { authGuard } from './shared/guards/auth.guard';
import { adminGuard } from './shared/guards/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'ventas',
    loadComponent: () => import('./pages/ventas/ventas.page').then((m) => m.VentasPage),
    canActivate: [authGuard],
  },
  {
    path: 'productos',
    loadComponent: () => import('./pages/productos/productos.page').then((m) => m.ProductosPage),
    canActivate: [authGuard],
  },
  {
    path: 'compras',
    loadComponent: () => import('./pages/compras/compras.page').then((m) => m.ComprasPage),
    canActivate: [authGuard],
  },
  {
    path: 'inventario',
    loadComponent: () => import('./pages/inventario/inventario.page').then((m) => m.InventarioPage),
    canActivate: [authGuard],
  },
  {
    path: 'cuentas-por-cobrar',
    loadComponent: () =>
      import('./pages/cuentas-por-cobrar/cuentas-por-cobrar.page').then((m) => m.CuentasPorCobrarPage),
    canActivate: [authGuard],
  },
  {
    path: 'cuentas-por-pagar',
    loadComponent: () =>
      import('./pages/cuentas-por-pagar/cuentas-por-pagar.page').then((m) => m.CuentasPorPagarPage),
    canActivate: [authGuard],
  },
  {
    path: 'reportes',
    loadComponent: () => import('./pages/reportes/reportes.page').then((m) => m.ReportesPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'ajustes',
    loadComponent: () => import('./pages/ajustes/ajustes.page').then((m) => m.AjustesPage),
    canActivate: [authGuard],
  },
  {
    path: 'usuarios',
    loadComponent: () => import('./pages/usuarios/usuarios.page').then((m) => m.UsuariosPage),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'modulo/:id',
    loadComponent: () => import('./pages/modulo/modulo.page').then((m) => m.ModuloPage),
    canActivate: [authGuard],
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
