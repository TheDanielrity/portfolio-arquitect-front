import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Resumen — Portfolio Admin',
    loadComponent: () => import('./dashboard').then((m) => m.AdminDashboard),
  },
  {
    path: 'profile',
    title: 'Perfil — Portfolio Admin',
    loadComponent: () => import('./content/profile-page').then((m) => m.ProfilePage),
    canDeactivate: [
      (component: { canLeave(): boolean | Promise<boolean> }) => component.canLeave(),
    ],
  },
  {
    path: 'services',
    title: 'Servicios — Portfolio Admin',
    loadComponent: () => import('./content/services-page').then((m) => m.ServicesPage),
    canDeactivate: [
      (component: { canLeave(): boolean | Promise<boolean> }) => component.canLeave(),
    ],
  },
  {
    path: 'settings',
    title: 'Configuración — Portfolio Admin',
    loadComponent: () => import('./content/settings-page').then((m) => m.SettingsPage),
    canDeactivate: [
      (component: { canLeave(): boolean | Promise<boolean> }) => component.canLeave(),
    ],
  },
  {
    path: 'taxonomy',
    title: 'Categorías y etiquetas — Portfolio Admin',
    loadComponent: () => import('./taxonomy/taxonomy-page').then((m) => m.TaxonomyPage),
  },
  {
    path: 'projects',
    loadChildren: () => import('./projects/project.routes').then((m) => m.projectRoutes),
  },
  {
    path: '**',
    title: 'Página no encontrada — Portfolio Admin',
    data: {
      adminPage: {
        label: 'Página no encontrada',
        description: 'Esta dirección no pertenece al panel. Utiliza el menú para continuar.',
        notFound: true,
      },
    },
    loadComponent: () => import('./admin-placeholder').then((m) => m.AdminPlaceholder),
  },
];
