import { Routes } from '@angular/router';
import { authGuard, authChildGuard, loginGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'admin/login',
    canActivate: [loginGuard],
    loadComponent: () => import('./features/admin/login/login').then((m) => m.Login),
    title: 'Acceso administrativo',
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [authChildGuard],
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout').then((m) => m.PublicLayout),
    loadChildren: () => import('./features/public/public.routes').then((m) => m.publicRoutes),
  },
];
