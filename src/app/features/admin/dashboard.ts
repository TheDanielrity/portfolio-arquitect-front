import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import type { ProjectResponse } from '../../core/api/generated/types.gen';
import { ProjectApi } from './projects/project-api.service';
import { projectError } from './projects/project-errors';
import { ProjectCover } from './projects/project-cover';
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, DatePipe, ProjectCover],
  template: `<header class="page-heading">
      <div>
        <p class="eyebrow">Tu espacio de trabajo</p>
        <h1>Resumen</h1>
        <p>Una mirada a tu portafolio y a lo que sigue.</p>
      </div>
      <a class="primary button" routerLink="/admin/projects/new">+ Nuevo proyecto</a>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
      <button type="button" (click)="load()" [disabled]="loading()">Reintentar resumen</button>
    }
    <div class="summary-grid" [attr.aria-busy]="loading()">
      @for (item of metrics(); track item.label) {
        <a class="summary-card" [routerLink]="item.path" [queryParams]="item.query"
          ><span>{{ item.label }}</span
          ><strong>{{ item.value === null ? '—' : item.value }}</strong></a
        >
      }
    </div>
    <header class="section-heading">
      <h2>Proyectos recientes</h2>
      <a routerLink="/admin/projects">Ver todos los proyectos →</a>
    </header>
    <div class="recent-grid">
      @for (project of projects(); track project.id) {
        <a class="recent-project" [routerLink]="['/admin/projects', project.id, 'edit']"
          ><app-project-cover [projectId]="project.id" />
          <div>
            <span class="eyebrow">{{
              project.status === 'PUBLISHED'
                ? 'Publicado'
                : project.status === 'ARCHIVED'
                  ? 'Archivado'
                  : 'Borrador'
            }}</span>
            <h3>{{ project.title }}</h3>
            <p>
              {{ project.location || 'Ubicación no indicada' }}
              @if (project.year) {
                · {{ project.year }}
              }
            </p>
            <small>Actualizado {{ project.updated_at | date: 'dd/MM/yyyy' }}</small>
          </div></a
        >
      } @empty {
        @if (!loading() && !error()) {
          <p>No hay proyectos todavía. Crea tu primer borrador.</p>
        }
      }
    </div>
    <h2 class="quick-heading">Acciones rápidas</h2>
    <div class="quick-actions">
      <a routerLink="/admin/projects/new"
        ><strong>Crear un proyecto →</strong
        ><span>Guarda un borrador y añade portada y galería desde el editor.</span></a
      ><a routerLink="/admin/profile"
        ><strong>Actualizar perfil →</strong
        ><span>Gestiona tu presentación profesional, fotografía y CV.</span></a
      >
    </div>`,
  styleUrls: ['./projects/project-controls.scss', './dashboard.scss'],
})
export class AdminDashboard {
  private readonly api = inject(ProjectApi);
  private readonly destroy = inject(DestroyRef);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly projects = signal<ProjectResponse[]>([]);
  readonly metrics = signal([
    {
      label: 'Total de proyectos',
      value: null as number | null,
      path: '/admin/projects',
      query: {},
    },
    {
      label: 'Publicados',
      value: null as number | null,
      path: '/admin/projects',
      query: { status: 'PUBLISHED' },
    },
    {
      label: 'Borradores',
      value: null as number | null,
      path: '/admin/projects',
      query: { status: 'DRAFT' },
    },
  ]);
  constructor() {
    this.load();
  }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      recent: this.api.list({ limit: 3, offset: 0, sort: 'updated_at', direction: 'desc' }),
      published: this.api.list({ limit: 1, offset: 0, status: 'PUBLISHED' }),
      draft: this.api.list({ limit: 1, offset: 0, status: 'DRAFT' }),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (data) => {
          this.projects.set(data.recent.items);
          const values = [data.recent.total, data.published.total, data.draft.total];
          this.metrics.update((items) =>
            items.map((item, index) => ({ ...item, value: values[index] })),
          );
        },
        error: (e) => this.error.set(projectError(e)),
      });
  }
}
