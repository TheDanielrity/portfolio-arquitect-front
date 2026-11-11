import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Observable } from 'rxjs';
import type { SocialCreate, SocialResponse } from '../../../core/api/generated/types.gen';
import { allPages } from '../projects/project-api.service';
import { fieldErrors } from '../projects/project-errors';
import { ProjectConfirm } from '../projects/project-confirm';
import { ProjectEditModal } from '../projects/project-edit-modal';
import { ContentApi } from './content-api.service';
import { contentError, contentOrder, contentText, nextOrder, webUrl } from './content-forms';
import { createWhatsappForm, parseWhatsapp, whatsappCountries, whatsappUrl } from './whatsapp-form';
@Component({
  selector: 'app-social-links',
  imports: [ReactiveFormsModule, ProjectConfirm, ProjectEditModal],
  templateUrl: './social-links.html',
  styleUrls: [
    '../projects/project-controls.scss',
    './content-controls.scss',
    './social-links.scss',
  ],
})
export class SocialLinks implements OnInit {
  private readonly api = inject(ContentApi);
  private readonly destroy = inject(DestroyRef);
  readonly locked = input(false);
  readonly items = signal<SocialResponse[]>([]);
  readonly loading = signal(false);
  readonly writing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly whatsapp = computed(() =>
    this.items().find((item) => item.platform.trim().toLowerCase() === 'whatsapp'),
  );
  readonly otherLinks = computed(() =>
    this.items().filter((item) => item.platform.trim().toLowerCase() !== 'whatsapp'),
  );
  readonly whatsappForm = createWhatsappForm();
  readonly countries = whatsappCountries;
  readonly whatsappError = signal('');
  readonly whatsappNotice = signal('');
  readonly whatsappWarning = signal('');
  readonly whatsappSaving = signal(false);
  readonly socialsLoaded = signal(false);
  private syncWhatsapp(): void {
    const existing = this.whatsapp();
    const parsed = existing ? parseWhatsapp(existing.url) : null;
    this.whatsappForm.reset({
      country: '51',
      code: '',
      phone: '',
      message: '',
      is_visible: existing?.is_visible ?? false,
      ...parsed,
    });
    this.whatsappWarning.set(
      existing && (!parsed || parsed.country === 'other')
        ? 'Revisa el código de país y el número del enlace existente antes de guardar. El enlace actual se conserva hasta que guardes los cambios.'
        : '',
    );
  }
  whatsappPreview(): string | null {
    return whatsappUrl(this.whatsappForm.getRawValue());
  }
  saveWhatsapp(): Promise<boolean> {
    if (this.busy() || this.locked() || this.editing() || !this.socialsLoaded())
      return Promise.resolve(false);
    this.whatsappForm.markAllAsTouched();
    const url = this.whatsappPreview();
    if (this.whatsappForm.invalid || !url) return Promise.resolve(false);
    const existing = this.whatsapp();
    const body = { url, is_visible: this.whatsappForm.controls.is_visible.value };
    this.whatsappSaving.set(true);
    this.whatsappError.set('');
    this.whatsappNotice.set('');
    this.whatsappForm.disable();
    return new Promise((resolve) => {
      (existing
        ? this.api.updateSocial(existing.id, body)
        : this.api.createSocial({
            ...body,
            platform: 'WhatsApp',
            sort_order: nextOrder(this.items()),
          })
      )
        .pipe(
          finalize(() => {
            this.whatsappSaving.set(false);
            this.whatsappForm.enable();
            resolve(false);
          }),
          takeUntilDestroyed(this.destroy),
        )
        .subscribe({
          next: (saved) => {
            this.items.update((items) =>
              existing
                ? items.map((item) => (item.id === saved.id ? saved : item))
                : [...items, saved],
            );
            this.syncWhatsapp();
            this.whatsappNotice.set(
              saved.is_visible
                ? 'WhatsApp guardado. El botón está visible en el portafolio.'
                : 'WhatsApp guardado. El botón está oculto.',
            );
            resolve(true);
          },
          error: (error: unknown) => {
            this.whatsappError.set(contentError(error));
          },
        });
    });
  }
  readonly editing = signal<SocialResponse | 'new' | null>(null);
  readonly confirmation = signal<{ message: string; action: () => void } | null>(null);
  readonly form = new FormGroup({
    platform: contentText(50, true),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2048), webUrl],
    }),
    username: contentText(100),
    sort_order: new FormControl(0, { nonNullable: true }),
    is_visible: new FormControl(true, { nonNullable: true }),
  });
  ngOnInit(): void {
    this.load();
  }
  busy(): boolean {
    return this.writing() || this.loading() || this.whatsappSaving();
  }
  hasChanges(): boolean {
    return (!!this.editing() && this.form.dirty) || this.whatsappForm.dirty;
  }
  load(keepError = false): void {
    if (this.loading()) return;
    if (!keepError) this.error.set('');
    this.loading.set(true);
    allPages((offset) => this.api.socials(offset))
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.socialsLoaded.set(true);
          if (!this.whatsappForm.dirty) this.syncWhatsapp();
        },
        error: (e) => this.error.set(contentError(e)),
      });
  }
  private discard(action: () => void): void {
    if (this.busy() || this.locked()) return;
    if (this.editing() && this.form.dirty)
      this.confirmation.set({ message: '¿Descartar los cambios del enlace social?', action });
    else action();
  }
  open(item: SocialResponse | 'new'): void {
    this.discard(() => {
      this.editing.set(item);
      this.form.reset(
        item === 'new'
          ? {
              platform: '',
              url: '',
              username: '',
              sort_order: nextOrder(this.items()),
              is_visible: true,
            }
          : { ...item, username: item.username ?? '' },
      );
      this.error.set('');
    });
  }
  cancel(): void {
    this.discard(() => this.editing.set(null));
  }
  body(): SocialCreate {
    const v = this.form.getRawValue();
    return { ...v, platform: v.platform.trim(), username: v.username || null };
  }
  save(): void {
    const current = this.editing();
    if (!current || this.busy() || this.locked()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (this.form.controls.platform.value.trim().toLowerCase() === 'whatsapp') {
      this.error.set('Configura WhatsApp desde su sección en el perfil.');
      return;
    }
    this.write(
      current === 'new'
        ? this.api.createSocial(this.body())
        : this.api.updateSocial(current.id, this.body()),
      true,
    );
  }
  private write(request: Observable<unknown>, form = false): void {
    if (this.busy() || this.locked()) return;
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
          this.notice.set('Enlaces actualizados.');
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
  visibility(item: SocialResponse): void {
    if (this.editing()) return;
    this.write(this.api.updateSocial(item.id, { is_visible: !item.is_visible }));
  }
  moveSocial(item: SocialResponse, direction: number): void {
    const links = this.otherLinks();
    const neighbor = links[links.indexOf(item) + direction];
    if (!neighbor) return;
    const index = this.items().indexOf(item);
    this.move(index, this.items().indexOf(neighbor) - index);
  }
  move(index: number, direction: number): void {
    const items = [...this.items()];
    const target = index + direction;
    if (this.editing() || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.write(contentOrder(items, (body) => this.api.orderSocials(body)));
  }
  remove(item: SocialResponse): void {
    if (this.busy() || this.locked() || this.editing()) return;
    this.confirmation.set({
      message: '¿Eliminar el enlace de ' + item.platform + '? Esta acción no modifica el perfil.',
      action: () => this.write(this.api.deleteSocial(item.id)),
    });
  }
  answer(value: boolean): void {
    const c = this.confirmation();
    this.confirmation.set(null);
    if (value) c?.action();
  }
}
