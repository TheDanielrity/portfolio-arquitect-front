import type { Routes } from '@angular/router';
import type { ProjectEditor } from './project-editor';
const canLeave = (component: ProjectEditor) => component.canLeave();
export const projectRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Proyectos — Portfolio Admin',
    loadComponent: () => import('./project-list').then((m) => m.ProjectList),
  },
  {
    path: 'new',
    title: 'Crear proyecto — Portfolio Admin',
    canDeactivate: [canLeave],
    loadComponent: () => import('./project-editor').then((m) => m.ProjectEditor),
  },
  {
    path: ':id/edit',
    title: 'Editar proyecto — Portfolio Admin',
    canDeactivate: [canLeave],
    loadComponent: () => import('./project-editor').then((m) => m.ProjectEditor),
  },
];
