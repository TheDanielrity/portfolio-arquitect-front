import { DatePipe } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPreview,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  forkJoin,
  of,
  switchMap,
  tap,
  map,
} from 'rxjs';
import type {
  PageProjectResponse,
  ProjectResponse,
  ProjectStatus,
  Visibility,
} from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { allPages, ProjectApi, ProjectQuery, Taxon } from './project-api.service';
import { projectError, PROJECT_STATUSES, PROJECT_VISIBILITIES } from './project-errors';
import { ProjectCover } from './project-cover';
import { contentOrder } from '../content/content-forms';
@Component({
  selector: 'app-project-list',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    ProjectCover,
    CdkDrag,
    CdkDropList,
    CdkDragPreview,
  ],
  templateUrl: './project-list.html',
  styleUrls: ['./project-controls.scss', './project-list.scss'],
})
export class ProjectList {
  readonly featuring = signal<string | null>(null);
  readonly featuredNotice = signal('');
  readonly featuredError = signal('');

  featuredLabel(project: ProjectResponse): string {
    if (this.featuring() === project.id) return 'Guardando destacado…';
    if (project.is_featured) return 'Proyecto destacado en portada';
    if (project.status !== 'PUBLISHED' || project.visibility !== 'PUBLIC')
      return 'Publica el proyecto con visibilidad pública para destacarlo';
    return 'Destacar en portada';
  }

  feature(project: ProjectResponse): void {
    if (
      this.featuring() ||
      this.reordering() ||
      this.state() !== 'loaded' ||
      project.is_featured ||
      project.status !== 'PUBLISHED' ||
      project.visibility !== 'PUBLIC'
    )
      return;
    this.featuring.set(project.id);
    this.featuredNotice.set('Guardando destacado…');
    this.featuredError.set('');
    this.api
      .update(project.id, { is_featured: true })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: () => {
          this.featuring.set(null);
          this.featuredNotice.set('Proyecto destacado en portada guardado.');
          this.refresh();
        },
        error: (error: unknown) => {
          this.featuring.set(null);
          this.featuredNotice.set('');
          this.featuredError.set(projectError(error));
          this.refresh();
        },
      });
  }
  previewImage(card: HTMLElement): string | null {
    const image = card.querySelector<HTMLImageElement>('app-project-cover img');
    return image ? image.currentSrc || image.src : null;
  }
  readonly reordering = signal(false);
  readonly reorderNotice = signal('');
  readonly reorderError = signal('');
  canReorder(): boolean {
    return (
      this.state() === 'loaded' &&
      !this.reordering() &&
      !this.featuring() &&
      this.query.sort === 'sort_order' &&
      this.query.direction === 'asc' &&
      !this.query.q &&
      !this.query.status &&
      !this.query.visibility &&
      this.query.is_featured === undefined &&
      !this.query.category_id &&
      !this.query.tag_id
    );
  }
  drop(event: CdkDragDrop<unknown>): void {
    this.move(event.previousIndex, event.currentIndex);
  }
  move(index: number, target: number): void {
    const page = this.page();
    if (
      !page ||
      !this.canReorder() ||
      index === target ||
      index < 0 ||
      target < 0 ||
      index >= page.items.length ||
      target >= page.items.length
    )
      return;
    const visible = [...page.items];
    moveItemInArray(visible, index, target);
    this.reordering.set(true);
    this.reorderNotice.set('Guardando orden…');
    this.reorderError.set('');
    const collection =
      page.offset === 0 && page.total === page.items.length
        ? of(page.items)
        : allPages((offset) =>
            this.api.list({ limit: 100, offset, sort: 'sort_order', direction: 'asc' }),
          );
    collection
      .pipe(
        switchMap((items) => {
          const ids = new Set(visible.map((item) => item.id));
          if (items.filter((item) => ids.has(item.id)).length !== visible.length)
            throw new Error('La colección cambió. Actualiza los proyectos antes de reordenar.');
          let next = 0;
          const ordered = items.map((item) => (ids.has(item.id) ? visible[next++] : item));
          return contentOrder(ordered, (body) => this.api.orderProjects(body));
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.reordering.set(false);
          this.reorderNotice.set('Orden del portafolio guardado.');
          this.refresh();
        },
        error: (error: unknown) => {
          this.reordering.set(false);
          this.reorderNotice.set('');
          this.reorderError.set(projectError(error));
          this.refresh();
        },
      });
  }
  private readonly reload = new BehaviorSubject(0);
  private readonly api = inject(ProjectApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly page = signal<PageProjectResponse | null>(null);
  readonly view = signal<'grid' | 'list'>('grid');
  statusFilter(value: ProjectStatus | ''): void {
    if (this.reordering()) return;
    this.filters.controls.status.setValue(value);
    this.apply();
  }
  readonly state = signal<'loading' | 'loaded' | 'empty' | 'error' | 'refreshing'>('loading');
  readonly error = signal('');
  readonly retryAfter = signal<string | null>(null);
  readonly categories = signal<Taxon[]>([]);
  readonly tags = signal<Taxon[]>([]);
  readonly statuses = PROJECT_STATUSES;
  readonly visibilities = PROJECT_VISIBILITIES;
  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    status: new FormControl<ProjectStatus | ''>('', { nonNullable: true }),
    visibility: new FormControl<Visibility | ''>('', { nonNullable: true }),
    is_featured: new FormControl('', { nonNullable: true }),
    category_id: new FormControl('', { nonNullable: true }),
    tag_id: new FormControl('', { nonNullable: true }),
    sort: new FormControl<NonNullable<ProjectQuery['sort']>>('sort_order', { nonNullable: true }),
    direction: new FormControl<'asc' | 'desc'>('asc', { nonNullable: true }),
  });
  private query: ProjectQuery = { limit: 20, offset: 0 };
  constructor() {
    forkJoin({
      categories: allPages((o) => this.api.taxons('categories', o)),
      tags: allPages((o) => this.api.taxons('tags', o)),
    })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (v) => {
          this.categories.set(v.categories);
          this.tags.set(v.tags);
        },
        error: () =>
          this.error.set('No se pudo cargar la clasificación. Puedes reintentar la página.'),
      });
    combineLatest([this.route.queryParamMap, this.reload])
      .pipe(map(([params]) => params))
      .pipe(
        tap((params) => {
          const offset = Number(params.get('offset') ?? 0);
          const rawStatus = params.get('status');
          const rawVisibility = params.get('visibility');
          const uuid = (s: string | null) =>
            s && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(s) ? s : undefined;
          this.query = {
            limit: 20,
            offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
            q: params.get('q')?.trim().slice(0, 200) || undefined,
            status: this.statuses.find((s) => s.value === rawStatus)?.value,
            visibility: this.visibilities.find((s) => s.value === rawVisibility)?.value,
            is_featured: ['true', 'false'].includes(params.get('is_featured') ?? '')
              ? params.get('is_featured') === 'true'
              : undefined,
            category_id: uuid(params.get('category_id')),
            tag_id: uuid(params.get('tag_id')),
            sort: ['sort_order', 'title', 'created_at', 'updated_at'].includes(
              params.get('sort') ?? '',
            )
              ? (params.get('sort') as ProjectQuery['sort'])
              : 'sort_order',
            direction: params.get('direction') === 'desc' ? 'desc' : 'asc',
          };
          this.filters.patchValue({
            ...this.query,
            q: this.query.q ?? '',
            status: this.query.status ?? '',
            visibility: this.query.visibility ?? '',
            is_featured: this.query.is_featured === undefined ? '' : String(this.query.is_featured),
            category_id: this.query.category_id ?? '',
            tag_id: this.query.tag_id ?? '',
          });
          this.state.set(this.page() ? 'refreshing' : 'loading');
          this.error.set('');
          this.retryAfter.set(null);
        }),
        switchMap(() =>
          this.api.list(this.query).pipe(
            catchError((e: unknown) => {
              this.state.set('error');
              this.error.set(projectError(e));
              this.retryAfter.set(e instanceof ApiError ? e.retryAfter : null);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe((page) => {
        if (!page) return;
        if (page.offset > 0 && page.offset >= page.total) {
          void this.navigate(Math.max(0, Math.floor((page.total - 1) / page.limit) * page.limit));
          return;
        }
        this.page.set(page);
        this.state.set(page.items.length ? 'loaded' : 'empty');
      });
  }
  apply(): void {
    if (this.filters.invalid || this.reordering()) return;
    const v = this.filters.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...v, q: v.q.trim() || null, offset: 0 },
    });
  }
  private navigate(offset: number): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...this.query, offset },
    });
  }
  paginate(step: -1 | 1): void {
    const p = this.page();
    if (!p || this.state() === 'refreshing' || this.reordering()) return;
    const offset = p.offset + step * p.limit;
    if (offset >= 0 && offset < p.total) void this.navigate(offset);
  }
  refresh(): void {
    this.reload.next(this.reload.value + 1);
  }
  status(value: ProjectStatus): string {
    return this.statuses.find((s) => s.value === value)!.label;
  }
  visibility(value: Visibility): string {
    return this.visibilities.find((s) => s.value === value)!.label;
  }
}
