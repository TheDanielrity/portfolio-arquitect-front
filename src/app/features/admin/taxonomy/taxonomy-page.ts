import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { projectSlug } from '../projects/project-slug';
import { allPages, ProjectApi, Taxon, TaxonomyKind } from '../projects/project-api.service';
import { fieldErrors, projectError } from '../projects/project-errors';
@Component({
  selector: 'app-taxonomy-page',
  imports: [ReactiveFormsModule],
  styleUrl: '../projects/project-controls.scss',
  template: `<header class="page-heading">
      <div>
        <h1>Categorías y etiquetas</h1>
        <p class="muted">Organiza la clasificación que puedes utilizar en tus proyectos.</p>
      </div>
    </header>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Cargando categorías y etiquetas…</p>
    } @else if (!ready()) {
      <button type="button" (click)="load()">Reintentar</button>
    } @else {
      <fieldset>
        <legend>Disponibles</legend>
        <div class="field-grid">
          @for (kind of kinds; track kind) {
            <section>
              <h2>{{ kind === 'categories' ? 'Categorías' : 'Etiquetas' }}</h2>
              <div class="choices">
                @for (taxon of available()[kind]; track taxon.id) {
                  <div class="relation-row">
                    <span class="name">{{ taxon.name }}</span>
                  </div>
                } @empty {
                  <p>
                    Todavía no hay
                    {{ kind === 'categories' ? 'categorías' : 'etiquetas' }} disponibles.
                  </p>
                }
              </div>
            </section>
          }
        </div>
      </fieldset>
      <form [formGroup]="createForm" (ngSubmit)="create()">
        <fieldset [disabled]="busy()">
          <legend>Crear categoría o etiqueta</legend>
          <div class="field-grid">
            <label
              >Tipo<select formControlName="kind">
                <option value="categories">Categoría</option>
                <option value="tags">Etiqueta</option>
              </select></label
            >
            <label
              >Nombre<input
                id="taxon-name"
                formControlName="name"
                [maxlength]="createForm.controls.kind.value === 'tags' ? 80 : 100"
              />
              @if (createForm.controls.name.hasError('backend')) {
                <span class="field-error">Revisa este nombre.</span>
              }
            </label>
            <button type="submit" [disabled]="busy()">Crear</button>
          </div>
        </fieldset>
      </form>
    }
    <p role="status">{{ busy() ? 'Creando…' : message() }}</p>`,
})
export class TaxonomyPage implements OnInit {
  readonly kinds = ['categories', 'tags'] as const;
  private readonly api = inject(ProjectApi);
  private readonly destroy = inject(DestroyRef);
  readonly available = signal<Record<TaxonomyKind, Taxon[]>>({ categories: [], tags: [] });
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly createForm = new FormGroup({
    kind: new FormControl<TaxonomyKind>('categories', { nonNullable: true }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    }),
  });
  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      categories: allPages((o) => this.api.taxons('categories', o)),
      tags: allPages((o) => this.api.taxons('tags', o)),
    })
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => {
          this.available.set(items);
          this.ready.set(true);
        },
        error: (e) => this.error.set(projectError(e)),
      });
  }
  create(): void {
    if (this.busy()) return;
    const v = this.createForm.getRawValue();
    const slug = projectSlug(v.name, v.kind === 'tags' ? 100 : 120);
    if (this.createForm.invalid || (v.kind === 'tags' && v.name.trim().length > 80) || !slug) {
      this.error.set('Revisa el nombre. Incluye letras o números y respeta la longitud permitida.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const body = { name: v.name.trim(), slug };
    const request =
      v.kind === 'categories' ? this.api.createCategory(body) : this.api.createTag(body);
    request
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (t) => {
          this.available.update((items) => ({
            ...items,
            [v.kind]: [...items[v.kind].filter((i) => i.id !== t.id), t],
          }));
          this.createForm.reset({ kind: v.kind, name: '' });
          this.message.set(v.kind === 'categories' ? 'Categoría creada.' : 'Etiqueta creada.');
        },
        error: (e) => {
          this.error.set(projectError(e));
          fieldErrors(this.createForm, e);
        },
      });
  }
}
