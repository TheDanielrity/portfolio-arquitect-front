import { inject } from '@angular/core';
import { CanActivateFn, CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .initialize()
    .pipe(map((authenticated) => authenticated || router.createUrlTree(['/admin/login'])));
};
export const authChildGuard: CanActivateChildFn = authGuard;
export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .initialize()
    .pipe(map((authenticated) => (authenticated ? router.createUrlTree(['/admin']) : true)));
};
