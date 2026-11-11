import { Routes } from '@angular/router';
export const publicRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home').then((m) => m.PublicHome),
    data: { publicHero: true },
    title: 'Portafolio — Proyectos seleccionados',
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./projects/public-projects-page').then((m) => m.PublicProjectsPage),
    title: 'Proyectos — Portafolio',
  },
  {
    path: 'projects/:slug',
    loadComponent: () => import('./project-detail/project-detail').then((m) => m.ProjectDetail),
    data: { publicHero: true },
    title: 'Proyecto — Portafolio',
  },
];
