import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Observable } from 'rxjs';
import type { ServiceCreate, ServiceResponse } from '../../../core/api/generated/types.gen';
import { allPages } from '../projects/project-api.service';
import { fieldErrors } from '../projects/project-errors';
import { ProjectConfirm } from '../projects/project-confirm';
import { ContentApi } from './content-api.service';
import { contentError, contentOrder, contentText, nextOrder } from './content-forms';
import { ContentDraft, ContentLeaveConfirm } from './content-draft';
@Component({
  selector: 'app-services-page',
  imports: [ReactiveFormsModule, ProjectConfirm, ContentLeaveConfirm],
  providers: [ContentDraft],
  templateUrl: './services-page.html',
  styleUrls: ['../projects/project-controls.scss', './content-controls.scss'],
})
export class ServicesPage implements OnInit {
  private readonly api = inject(ContentApi);
  private readonly destroy = inject(DestroyRef);
  readonly draft = inject(ContentDraft);
  readonly items = signal<ServiceResponse[]>([]);
  readonly loading = signal(false);
  readonly writing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editing = signal<ServiceResponse | 'new' | null>(null);
  readonly confirmation = signal<{ message: string; action: () => void } | null>(null);
  readonly form = new FormGroup({
    name: contentText(150, true),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(170),
        Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      ],
    }),
    short_description: contentText(300),
    description: contentText(20000),
    icon: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100), Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)],
    }),
    sort_order: new FormControl(0, { nonNullable: true }),
    is_visible: new FormControl(true, { nonNullable: true }),
  });
  ngOnInit(): void {
    this.load();
  }
  busy(): boolean {
    return this.writing() || this.loading();
  }
  load(keepError = false): void {
    if (this.loading()) return;
    if (!keepError) this.error.set('');
    this.loading.set(true);
    allPages((offset) => this.api.services(offset))
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => this.items.set(items),
        error: (e) => this.error.set(contentError(e)),
      });
  }
  private discard(action: () => void): void {
    if (this.busy()) return;
    if (this.editing() && this.form.dirty)
      this.confirmation.set({ message: 'Â¿Descartar los cambios del servicio?', action });
    else action();
  }
  open(item: ServiceResponse | 'new'): void {
    this.discard(() => {
      this.editing.set(item);
      this.form.reset(
        item === 'new'
          ? {
              name: '',
              slug: '',
              short_description: '',
              description: '',
              icon: '',
              sort_order: nextOrder(this.items()),
              is_visible: true,
            }
          : {
              ...item,
              short_description: item.short_description ?? '',
              description: item.description ?? '',
              icon: item.icon ?? '',
            },
      );
      this.error.set('');
    });
  }
  cancel(): void {
    this.discard(() => this.editing.set(null));
  }
  body(): ServiceCreate {
    const v = this.form.getRawValue();
    return {
      ...v,
      name: v.name.trim(),
      slug: v.slug.trim(),
      short_description: v.short_description || null,
      description: v.description || null,
      icon: v.icon || null,
    };
  }
  save(): void {
    const current = this.editing();
    if (!current || this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.write(
      current === 'new'
        ? this.api.createService(this.body())
        : this.api.updateService(current.id, this.body()),
      true,
    );
  }
  private write(request: Observable<unknown>, form = false): void {
    if (this.busy()) return;
    this.writing.set(true);
    this.error.set('');
    this.notice.set('');
    if (form) this.form.disable();
    request
      .pipe(
        finalize(() => {
          this.writing.set(false);
          if (this.form.disabled) this.form.enable();
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          if (form) {
            this.form.markAsPristine();
            this.editing.set(null);
          }
          this.notice.set('Servicios actualizados.');
          this.load();
        },
        error: (e: unknown) => {
          if (form) {
            this.form.enable();
            fieldErrors(this.form, e);
          }
          this.error.set(contentError(e));
          if (!form) this.load(true);
        },
      });
  }
  visibility(item: ServiceResponse): void {
    if (this.editing()) return;
    this.write(this.api.updateService(item.id, { is_visible: !item.is_visible }));
  }
  move(index: number, direction: number): void {
    const items = [...this.items()];
    const target = index + direction;
    if (this.editing() || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.write(contentOrder(items, (body) => this.api.orderServices(body)));
  }
  remove(item: ServiceResponse): void {
    if (this.busy() || this.editing()) return;
    this.confirmation.set({
      message: 'Â¿Eliminar el servicio ' + item.name + '? La eliminaciÃ³n es permanente.',
      action: () => this.write(this.api.deleteService(item.id)),
    });
  }
  answer(value: boolean): void {
    const c = this.confirmation();
    this.confirmation.set(null);
    if (value) c?.action();
  }
  canLeave(): boolean | Promise<boolean> {
    return this.draft.canLeave(!!this.editing() && this.form.dirty, this.writing());
  }
}
