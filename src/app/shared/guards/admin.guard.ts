import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/** Permite el acceso solo a usuarios con rol de administrador. */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.esAdmin()) return true;
  return router.createUrlTree(['/home']);
};
