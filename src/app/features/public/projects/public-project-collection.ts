import { inject, Injectable, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, catchError, EMPTY } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import type { PagePublicProjectCard, PublicCategory } from '../../../core/api/generated/types.gen';
import { PublicProjectsApi, PublicProjectQuery } from './public-projects-api';
export function publicProjectError(error: unknown): string {
  const status = error instanceof ApiError ? error.status : -1;
  if (status === 0) return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (status === 429) return 'Demasiadas solicitudes. Espera antes de volver a intentarlo.';
  if (status === 400 || status === 422)
    return 'No se pudieron aplicar los filtros. Restablécelos e inténtalo de nuevo.';
  if (status === 404) return 'Esta colección ya no está disponible.';
  if (status === 401 || status === 403) return 'Esta colección no está disponible al público.';
  return 'Los proyectos no están disponibles temporalmente. Vuelve a intentarlo.';
}
@Injectable()
export class PublicProjectCollection {
  private readonly api = inject(PublicProjectsApi);
  private readonly requests = new Subject<PublicProjectQuery>();
  private readonly categoryRequests = new Subject<void>();
  readonly initialPage = signal<PagePublicProjectCard | null>(null);
  readonly page = signal<PagePublicProjectCard | null>(null);
  readonly query = signal<PublicProjectQuery>({ limit: 12, offset: 0 });
  readonly loading = signal(false);
  readonly error = signal<unknown>(null);
  readonly categories = signal<PublicCategory[]>([]);
  readonly categoryError = signal(false);
  readonly categoryLoading = signal(false);
  constructor() {
    const destroy = inject(DestroyRef);
    this.requests
      .pipe(
        switchMap((q) =>
          this.api.list(q).pipe(
            catchError((e: unknown) => {
              this.error.set(e);
              this.loading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(destroy),
      )
      .subscribe((p) => {
        this.page.set(p);
        if (!this.initialPage()) this.initialPage.set(p);
        this.loading.set(false);
      });
    this.categoryRequests
      .pipe(
        switchMap(() =>
          this.api.categoryOptions().pipe(
            catchError(() => {
              this.categoryError.set(true);
              this.categoryLoading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(destroy),
      )
      .subscribe((categories) => {
        this.categories.set(categories);
        this.categoryLoading.set(false);
      });
    this.retryCategories();
  }
  retryCategories(): void {
    if (this.categoryLoading()) return;
    this.categoryError.set(false);
    this.categoryLoading.set(true);
    this.categoryRequests.next();
  }
  load(query: PublicProjectQuery): void {
    this.query.set(query);
    this.loading.set(true);
    this.error.set(null);
    this.requests.next(query);
  }
  retry(): void {
    this.load(this.query());
  }
}
