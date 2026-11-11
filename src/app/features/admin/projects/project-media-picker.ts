import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, finalize, forkJoin, map, of, switchMap } from 'rxjs';
import { ProjectApi } from './project-api.service';
import { projectPhotographs } from './project-photographs';
import { ProjectSectionsApi } from './sections/project-sections-api.service';
import type { MediaPage, MediaResponse, MediaType } from '../../../core/api/generated/types.gen';
import { MediaApi } from '../media/media-api.service';
import { MediaPreview } from '../media/media-preview';
import { MediaDetail } from '../media/media-detail';
import { mediaTypeLabel, MEDIA_TYPES } from '../media/media-policy';
import { projectError } from './project-errors';
@Component({
  selector: 'app-project-media-picker',
  imports: [ReactiveFormsModule, MediaPreview, MediaDetail],
  template: `<dialog #dialog aria-labelledby="media-picker-title" (cancel)="cancel($event)">
      <header class="page-heading">
        <h2 id="media-picker-title">
          {{ projectId() ? 'Elegir fotografías del proyecto' : 'Elegir de biblioteca' }}
        </h2>
        <button
          type="button"
          class="close-picker"
          (click)="closed.emit()"
          aria-label="Cerrar selector"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>
      @if (projectId()) {
        <p>Selecciona fotografías que ya pertenecen a este proyecto.</p>
      } @else {
        <p>
          Reutiliza un archivo de la biblioteca. El original y sus usos en otros proyectos se
          conservan.
        </p>
      }
      <form class="filters" [formGroup]="filters" (ngSubmit)="load(0)">
        <label>Buscar<input formControlName="q" maxlength="200" type="search" /></label>
        @if (!projectId() && !mediaType()) {
          <label
            >Tipo<select formControlName="type" [attr.disabled]="mediaType() ? '' : null">
              @if (!allowedTypes()) {
                <option value="">Todos</option>
              }
              @for (t of availableTypes(); track t.value) {
                <option [value]="t.value">{{ t.label }}</option>
              }
            </select></label
          >
        }
        @if (!projectId()) {
          <button type="submit" [disabled]="busy() || filters.invalid">Buscar</button>
        }
      </form>
      @if (error()) {
        <p role="alert" class="error">{{ error() }}</p>
        <button type="button" (click)="load(0)">Reintentar</button>
      }
      @if (busy()) {
        <p role="status">Cargando archivos…</p>
      }
      @if (page(); as p) {
        @if (projectId()) {
          <div class="photo-options" aria-label="Fotografías disponibles">
            @for (asset of p.items; track asset.id) {
              <button
                type="button"
                class="photo-option"
                [disabled]="busy()"
                [attr.aria-label]="
                  'Seleccionar fotografía ' + (asset.title || asset.original_filename)
                "
                (click)="selected.emit(asset)"
              >
                <app-media-preview
                  [asset]="asset"
                  [autoload]="true"
                  [controls]="false"
                  [cover]="true"
                  fit="contain"
                />
                <span class="photo-label">{{ asset.title || asset.original_filename }}</span>
              </button>
            } @empty {
              <p>No hay fotografías para estos filtros.</p>
            }
          </div>
        } @else {
          @for (asset of p.items; track asset.id) {
            <div class="relation-row">
              <app-media-preview [asset]="asset" />
              <div class="name">
                <strong>{{ asset.title || asset.original_filename }}</strong>
                <p>{{ typeLabel(asset.type) }}</p>
              </div>
              <button type="button" (click)="detailId.set(asset.id)">
                Ver detalles y gestionar
              </button>
              <button type="button" [disabled]="busy()" (click)="selected.emit(asset)">
                Seleccionar {{ asset.title || asset.original_filename }}
              </button>
            </div>
          } @empty {
            <p>No hay archivos para estos filtros.</p>
          }
        }
        <nav class="pagination" aria-label="Paginación de archivos">
          <button
            type="button"
            [disabled]="busy() || p.offset === 0"
            (click)="load(p.offset - p.limit)"
          >
            Anterior</button
          ><span>{{ p.total }} archivos</span
          ><button
            type="button"
            [disabled]="busy() || p.offset + p.limit >= p.total"
            (click)="load(p.offset + p.limit)"
          >
            Siguiente
          </button>
        </nav>
      }
    </dialog>
    @if (detailId(); as id) {
      <app-media-detail [id]="id" (closed)="detailId.set(null)" (changed)="refreshDetails()" />
    }`,
  styleUrls: ['./project-controls.scss', './project-media-picker.scss'],
})
export class ProjectMediaPicker {
  private readonly api = inject(MediaApi);
  private readonly projects = inject(ProjectApi);
  private readonly sections = inject(ProjectSectionsApi);
  readonly projectId = input<string | null>(null);
  private readonly destroy = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly selected = output<MediaResponse>();
  readonly mediaType = input<MediaType | null>(null);
  readonly allowedTypes = input<readonly MediaType[] | null>(null);
  readonly closed = output<void>();
  readonly page = signal<MediaPage | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly detailId = signal<string | null>(null);
  private searchPending = false;
  refreshDetails(): void {
    this.detailId.set(null);
    this.page.set(null);
    this.load(0);
  }
  readonly types = MEDIA_TYPES;
  readonly typeLabel = mediaTypeLabel;
  readonly availableTypes = computed(() =>
    this.types.filter((type) => !this.allowedTypes() || this.allowedTypes()!.includes(type.value)),
  );
  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    type: new FormControl<MediaType | ''>('', { nonNullable: true }),
  });
  constructor() {
    this.destroy.onDestroy(() => {
      this.searchPending = false;
    });
    this.filters.controls.q.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroy))
      .subscribe(() => {
        if (!this.projectId()) return;
        if (this.busy()) this.searchPending = true;
        else this.load(0);
      });
    afterNextRender(() => {
      this.filters.controls.type.setValue(this.mediaType() ?? this.allowedTypes()?.[0] ?? '');
      this.dialog().nativeElement.showModal();
      this.load(0);
    });
  }
  load(offset: number): void {
    if (this.busy() || this.filters.invalid || offset < 0) return;
    this.busy.set(true);
    this.error.set('');
    const v = this.filters.getRawValue();
    const request = this.projectId()
      ? projectPhotographs(this.projects, this.sections, this.projectId()!).pipe(
          switchMap((links) => {
            const ids = [
              ...new Set(
                links
                  .filter((link) => ['GALLERY', 'PLAN', 'RENDER'].includes(link.role))
                  .map((link) => link.media_id),
              ),
            ];
            return ids.length
              ? forkJoin(ids.map((id) => this.api.detail(id)))
              : of([] as MediaResponse[]);
          }),
          map((assets): MediaPage => {
            const query = v.q.trim().toLocaleLowerCase();
            const items = assets.filter(
              (asset) =>
                asset.type === 'IMAGE' &&
                (!query ||
                  [asset.title, asset.original_filename, asset.alt_text].some((value) =>
                    value?.toLocaleLowerCase().includes(query),
                  )),
            );
            return {
              items: items.slice(offset, offset + 12),
              total: items.length,
              limit: 12,
              offset,
            };
          }),
        )
      : this.api.list({
          limit: 12,
          offset,
          q: v.q.trim() || undefined,
          type:
            this.mediaType() ??
            (this.allowedTypes()
              ? v.type && this.allowedTypes()!.includes(v.type)
                ? v.type
                : this.allowedTypes()![0]
              : v.type || undefined),
          sort: 'created_at',
          direction: 'desc',
        });
    request
      .pipe(
        finalize(() => {
          this.busy.set(false);
          if (this.searchPending) {
            this.searchPending = false;
            this.load(0);
          }
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: (p) => this.page.set(p), error: (e) => this.error.set(projectError(e)) });
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }
}
