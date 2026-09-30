import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const usuario = await auth.usuarioActual();
  if (usuario) return true;
  return router.createUrlTree(['/login']);
};
