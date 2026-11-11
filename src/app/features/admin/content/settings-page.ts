import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import type { SettingKey, SettingResponse } from '../../../core/api/generated/types.gen';
import { ContentApi } from './content-api.service';
import { ContentDraft, ContentLeaveConfirm } from './content-draft';
import { contentError, contentText } from './content-forms';
import { fieldErrors } from '../projects/project-errors';
type EditableSettingKey = Exclude<SettingKey, 'contact_enabled'>;
const plainText = (control: AbstractControl) => {
  const value: unknown = control.value;
  return typeof value === 'string' &&
    (value.includes('<') ||
      value.includes('>') ||
      Array.from(value).some((character) => character.charCodeAt(0) < 32))
    ? { plainText: true }
    : null;
};
@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, ContentLeaveConfirm],
  providers: [ContentDraft],
  templateUrl: './settings-page.html',
  styleUrls: ['../projects/project-controls.scss', './content-controls.scss'],
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ContentApi);
  private readonly destroy = inject(DestroyRef);
  readonly draft = inject(ContentDraft);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly saving = signal<EditableSettingKey | null>(null);
  readonly notice = signal('');
  readonly unknown = signal<string[]>([]);
  readonly configured = signal<EditableSettingKey[]>([]);
  readonly title = new FormGroup({ value: contentText(200, true) });
  readonly description = new FormGroup({ value: contentText(500, true) });
  readonly keys = ['site_title', 'site_description'] as const;
  constructor() {
    this.title.controls.value.addValidators(plainText);
    this.description.controls.value.addValidators(plainText);
  }
  ngOnInit(): void {
    this.load();
  }
  formFor(key: EditableSettingKey) {
    switch (key) {
      case 'site_title':
        return this.title;
      case 'site_description':
        return this.description;
    }
  }
  hasChanges(): boolean {
    return this.title.dirty || this.description.dirty;
  }
  load(): void {
    if (this.saving() || this.hasChanges()) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .settings()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (rows) => this.accept(rows),
        error: (e) => this.error.set(contentError(e)),
      });
  }
  private accept(rows: SettingResponse[]): void {
    this.title.reset({ value: '' });
    this.description.reset({ value: '' });
    const configured: EditableSettingKey[] = [];
    const unknown: string[] = [];
    for (const row of rows) {
      if (row.key === 'contact_enabled') continue;
      if (!this.keys.some((key) => key === row.key)) {
        unknown.push(row.key);
        continue;
      }
      if (row.key === 'site_title' && typeof row.value === 'string') {
        this.title.reset({ value: row.value });
        configured.push(row.key);
      } else if (row.key === 'site_description' && typeof row.value === 'string') {
        this.description.reset({ value: row.value });
        configured.push(row.key);
      } else {
        this.error.set(
          'Una configuración conocida tiene un tipo incompatible. Revisa el contrato antes de guardar.',
        );
      }
    }
    this.unknown.set(unknown);
    this.configured.set(configured);
    this.loaded.set(true);
  }
  save(key: EditableSettingKey): void {
    if (this.saving() || !this.loaded() || this.loading()) return;
    const form = this.formFor(key);
    form.markAllAsTouched();
    const value = form.getRawValue().value;
    if (form.invalid || value === null) return;
    this.saving.set(key);
    this.error.set('');
    this.notice.set('');
    form.disable();
    this.api
      .putSetting(key, { value })
      .pipe(
        finalize(() => {
          this.saving.set(null);
          if (form.disabled) form.enable();
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (row) => {
          if (row.key !== key || typeof row.value !== typeof value) {
            this.error.set(
              'El servidor devolvió un contrato inesperado. Tus cambios se conservan.',
            );
            return;
          }
          if (key === 'site_title' && typeof row.value === 'string')
            this.title.reset({ value: row.value });
          else if (key === 'site_description' && typeof row.value === 'string')
            this.description.reset({ value: row.value });
          this.configured.update((keys) => (keys.includes(key) ? keys : [...keys, key]));
          this.notice.set('Configuración guardada: ' + key + '.');
        },
        error: (e: unknown) => {
          form.enable();
          this.error.set(contentError(e));
          fieldErrors(form, e);
        },
      });
  }
  canLeave(): boolean | Promise<boolean> {
    return this.draft.canLeave(this.hasChanges(), !!this.saving());
  }
}
