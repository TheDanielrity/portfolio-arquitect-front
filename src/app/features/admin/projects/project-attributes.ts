import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Observable, switchMap } from 'rxjs';
import type { AttributeResponse } from '../../../core/api/generated/types.gen';
import { allPages, ProjectApi } from './project-api.service';
import { fieldErrors, projectError } from './project-errors';
import { ProjectConfirm } from './project-confirm';
import { saveOrder } from './project-order';
import { ProjectEditModal } from './project-edit-modal';
@Component({
  selector: 'app-project-attributes',
  imports: [ReactiveFormsModule, ProjectConfirm, ProjectEditModal],
  template: `<fieldset>
      <legend>Características adicionales</legend>
      <p class="muted">
        Agrega información adicional como materiales, escala, programa o características de tu
        proyecto.
      </p>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (loading()) {
        <p role="status">Cargando características…</p>
      } @else if (!ready()) {
        <button type="button" (click)="load()">Reintentar características</button>
      } @else {
        @for (item of items(); track item.id; let index = $index) {
          <div class="relation-row">
            <div class="name">
              <strong>{{ item.label }}</strong>
              <p>{{ item.value }}</p>
            </div>
            <button
              type="button"
              [disabled]="busy() || locked() || hasChanges() || index === 0"
              (click)="move(index, -1)"
              [attr.aria-label]="'Subir ' + item.label"
            >
              ↑</button
            ><button
              type="button"
              [disabled]="busy() || locked() || hasChanges() || index === items().length - 1"
              (click)="move(index, 1)"
              [attr.aria-label]="'Bajar ' + item.label"
            >
              ↓</button
            ><button
              type="button"
              [disabled]="busy() || locked() || hasChanges()"
              (click)="edit(item)"
            >
              Editar</button
            ><button
              type="button"
              [disabled]="busy() || locked() || hasChanges()"
              (click)="removing.set(item)"
            >
              Eliminar
            </button>
          </div>
        } @empty {
          <p>Aún no has agregado características adicionales.</p>
        }
        <button
          type="button"
          [disabled]="busy() || locked() || expanded()"
          (click)="expanded.set(true)"
        >
          + Agregar característica
        </button>
        @if (expanded()) {
          <app-project-edit-modal
            [title]="editing() ? 'Editar característica' : 'Agregar característica'"
            [blocked]="busy()"
            (cancelled)="cancelEdit()"
          >
            <form [formGroup]="form" (ngSubmit)="save()">
              @if (error()) {
                <p class="error" role="alert">{{ error() }}</p>
              }
              <div class="field-grid">
                <label
                  >Nombre de la característica<input
                    id="attribute-label"
                    formControlName="label"
                    maxlength="100"
                    placeholder="Material principal"
                    aria-describedby="attribute-label-error"
                    [attr.aria-invalid]="invalid('label')"
                  />
                  @if (invalid('label')) {
                    <span id="attribute-label-error" class="field-error"
                      >Escribe un nombre de hasta 100 caracteres.</span
                    >
                  }</label
                ><label
                  >Valor<input
                    id="attribute-value"
                    formControlName="value"
                    maxlength="500"
                    placeholder="Hormigón visto"
                    aria-describedby="attribute-value-error"
                    [attr.aria-invalid]="invalid('value')"
                  />
                  @if (invalid('value')) {
                    <span id="attribute-value-error" class="field-error"
                      >Escribe un valor de hasta 500 caracteres.</span
                    >
                  }</label
                ><button type="submit" class="primary" [disabled]="busy() || locked()">
                  Aceptar
                </button>
                <button type="button" (click)="cancelEdit()" [disabled]="busy()">Cancelar</button>
              </div>
            </form>
          </app-project-edit-modal>
        }
      }
      <p role="status">{{ busy() ? 'Guardando características…' : message() }}</p>
    </fieldset>
    @if (removing() || cancelling()) {
      <app-project-confirm
        [title]="removing() ? 'Eliminar característica' : 'Descartar cambios'"
        [message]="
          removing()
            ? 'Esta característica se quitará del proyecto. Los demás datos se conservan.'
            : 'Los cambios de esta característica todavía no están guardados. ¿Quieres descartarlos?'
        "
        [action]="removing() ? 'Eliminar característica' : 'Descartar cambios'"
        (answer)="answer($event)"
      />
    }`,
  styleUrls: ['./project-controls.scss', './project-attributes.scss'],
})
export class ProjectAttributes implements OnInit {
  readonly projectId = input.required<string>();
  readonly locked = input(false);
  private readonly api = inject(ProjectApi);
  private readonly destroy = inject(DestroyRef);
  readonly items = signal<AttributeResponse[]>([]);
  readonly removing = signal<AttributeResponse | null>(null);
  readonly cancelling = signal(false);
  cancelEdit(): void {
    if (this.hasChanges()) this.cancelling.set(true);
    else this.reset();
  }
  answer(accepted: boolean): void {
    const item = this.removing();
    const cancel = this.cancelling();
    this.removing.set(null);
    this.cancelling.set(false);
    if (accepted && item) this.remove(item);
    else if (accepted && cancel) this.reset();
  }
  readonly expanded = signal(false);
  readonly submitted = signal(false);
  readonly editing = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = new FormGroup({
    label: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)],
    }),
    value: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)],
    }),
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    afterRenderEffect(() => {
      const expanded = this.expanded();
      this.editing();
      if (expanded)
        this.host.nativeElement.querySelector<HTMLInputElement>('#attribute-label')?.focus();
    });
  }
  ngOnInit(): void {
    this.load();
  }
  load(): void {
    this.loading.set(true);
    allPages((o) => this.api.attributes(this.projectId(), o))
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.ready.set(true);
        },
        error: (e) => {
          this.error.set(projectError(e));
          fieldErrors(this.form, e);
        },
      });
  }
  private run(request: Observable<unknown>, reloadOnError = false): void {
    if (this.busy() || this.locked()) return;
    this.busy.set(true);
    this.error.set('');
    request
      .pipe(
        switchMap(() => allPages((o) => this.api.attributes(this.projectId(), o))),
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.reset();
          this.message.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
        },
        error: (e) => {
          this.error.set(projectError(e));
          fieldErrors(this.form, e);
          if (reloadOnError) this.load();
        },
      });
  }
  hasChanges(): boolean {
    return this.form.dirty;
  }
  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c?.invalid && (this.submitted() || (c.dirty && c.touched) || !!c.errors?.['backend']);
  }
  save(): void {
    if (this.busy() || this.locked()) return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Completa el nombre y el valor de la característica.');
      return;
    }
    const body = this.form.getRawValue();
    const id = this.editing();
    this.run(
      id
        ? this.api.updateAttribute(this.projectId(), id, body)
        : this.api.addAttribute(this.projectId(), {
            ...body,
            sort_order: (this.items().at(-1)?.sort_order ?? -1) + 1,
          }),
    );
  }
  edit(item: AttributeResponse): void {
    this.expanded.set(true);
    this.submitted.set(false);
    this.editing.set(item.id);
    this.form.reset({ label: item.label, value: item.value });
  }
  reset(): void {
    this.expanded.set(false);
    this.submitted.set(false);
    this.editing.set(null);
    this.form.reset();
  }
  remove(item: AttributeResponse): void {
    this.run(this.api.deleteAttribute(this.projectId(), item.id));
  }
  move(index: number, step: -1 | 1): void {
    const items = [...this.items()];
    const target = index + step;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.run(saveOrder(this.api, this.projectId(), 'attributes', items), true);
  }
}
