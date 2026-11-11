import { Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { finalize, forkJoin, of } from 'rxjs';
import { allPages, ProjectApi, Taxon, TaxonomyKind } from './project-api.service';
import { projectError } from './project-errors';
import { ProjectEditModal } from './project-edit-modal';
@Component({
  selector: 'app-project-taxonomy',
  imports: [RouterLink, ProjectEditModal],
  template: `<fieldset>
    <legend>Clasificación</legend>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Cargando clasificación…</p>
    } @else if (!ready()) {
      <button type="button" (click)="load()">Reintentar clasificación</button>
    } @else {
      <div class="field-grid">
        @for (kind of kinds; track kind) {
          <section>
            <h2>{{ kind === 'categories' ? 'Categorías' : 'Etiquetas' }}</h2>
            @if (available()[kind].length) {
              <p>{{ selectedNames(kind) || 'Sin asignar' }}</p>
            } @else {
              <p>
                Todavía no hay {{ kind === 'categories' ? 'categorías' : 'etiquetas' }} disponibles.
              </p>
              <a routerLink="/admin/taxonomy">Ir a Categorías y etiquetas</a>
            }
          </section>
        }
      </div>
      <button type="button" (click)="open()" [disabled]="busy() || locked()">
        Editar clasificación
      </button>
      @if (expanded()) {
        <app-project-edit-modal
          title="Clasificación del proyecto"
          [blocked]="busy()"
          (cancelled)="cancel()"
        >
          @if (error()) {
            <p role="alert" class="error">{{ error() }}</p>
          }
          <div class="field-grid">
            @for (kind of kinds; track kind) {
              <section>
                <h2>{{ kind === 'categories' ? 'Categorías' : 'Etiquetas' }}</h2>
                <div class="choices">
                  @for (taxon of available()[kind]; track taxon.id) {
                    <label class="choice"
                      ><input
                        type="checkbox"
                        [checked]="selection()[kind].includes(taxon.id)"
                        [disabled]="busy() || locked()"
                        (change)="toggle(kind, taxon.id, $event)"
                      />{{ taxon.name }}</label
                    >
                  } @empty {
                    <p>
                      Todavía no hay
                      {{ kind === 'categories' ? 'categorías' : 'etiquetas' }} disponibles.
                    </p>
                    <a routerLink="/admin/taxonomy">Ir a Categorías y etiquetas</a>
                  }
                </div>
              </section>
            }
          </div>
          <div class="actions">
            <button
              type="button"
              class="primary"
              [disabled]="busy() || locked()"
              (click)="accept()"
            >
              Aceptar
            </button>
            <button type="button" [disabled]="busy()" (click)="cancel()">Cancelar</button>
          </div>
        </app-project-edit-modal>
      }
    }
    <p role="status">{{ busy() ? 'Guardando clasificación…' : message() }}</p>
  </fieldset>`,
  styleUrl: './project-controls.scss',
})
export class ProjectTaxonomy implements OnInit {
  readonly projectId = input.required<string>();
  readonly locked = input(false);
  readonly kinds = ['categories', 'tags'] as const;
  private readonly api = inject(ProjectApi);
  private readonly destroy = inject(DestroyRef);
  readonly available = signal<Record<TaxonomyKind, Taxon[]>>({ categories: [], tags: [] });
  readonly selection = signal<Record<TaxonomyKind, string[]>>({ categories: [], tags: [] });
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly changed = signal<TaxonomyKind[]>([]);
  readonly expanded = signal(false);
  private previous: Record<TaxonomyKind, string[]> = { categories: [], tags: [] };
  private previousChanged: TaxonomyKind[] = [];

  selectedNames(kind: TaxonomyKind): string {
    return this.available()
      [kind].filter((item) => this.selection()[kind].includes(item.id))
      .map((item) => item.name)
      .join(', ');
  }

  open(): void {
    this.previous = structuredClone(this.selection());
    this.previousChanged = [...this.changed()];
    this.expanded.set(true);
  }

  cancel(): void {
    if (this.busy()) return;
    this.selection.set(this.previous);
    this.changed.set(this.previousChanged);
    this.expanded.set(false);
    this.error.set('');
  }

  accept(): void {
    if (this.busy() || this.locked()) return;
    this.busy.set(true);
    this.error.set('');
    const requests = this.changed().map((kind) =>
      this.api.assign(this.projectId(), kind, this.selection()[kind]),
    );
    (requests.length ? forkJoin(requests) : of([]))
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.changed.set([]);
          this.expanded.set(false);
          this.message.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
        },
        error: (error) => this.error.set(projectError(error)),
      });
  }
  hasChanges(): boolean {
    return this.changed().length > 0;
  }
  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      categories: allPages((o) => this.api.taxons('categories', o)),
      tags: allPages((o) => this.api.taxons('tags', o)),
      assignedCategories: allPages((o) => this.api.taxons('categories', o, this.projectId())),
      assignedTags: allPages((o) => this.api.taxons('tags', o, this.projectId())),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (v) => {
          this.available.set({ categories: v.categories, tags: v.tags });
          this.selection.set({
            categories: v.assignedCategories.map((t) => t.id),
            tags: v.assignedTags.map((t) => t.id),
          });
          this.ready.set(true);
        },
        error: (e) => {
          this.error.set(projectError(e));
        },
      });
  }
  toggle(kind: TaxonomyKind, id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const ids = new Set(this.selection()[kind]);
    if (checked) ids.add(id);
    else ids.delete(id);
    if (ids.size > 100) {
      (event.target as HTMLInputElement).checked = false;
      this.error.set('Puedes asignar hasta 100 elementos por grupo.');
      return;
    }
    this.selection.update((v) => ({ ...v, [kind]: [...ids] }));
    this.changed.update((kinds) => (kinds.includes(kind) ? kinds : [...kinds, kind]));
  }
}
