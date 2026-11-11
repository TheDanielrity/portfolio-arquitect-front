import { DatePipe } from '@angular/common';
import {
  afterNextRender,
  Component,
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
import type { MediaResponse } from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { MediaApi } from './media-api.service';
import { mediaError } from './media-errors';
import { MediaPreview } from './media-preview';
import { fileSize } from './media-policy';
@Component({
  selector: 'app-media-detail',
  imports: [ReactiveFormsModule, DatePipe, MediaPreview],
  templateUrl: './media-detail.html',
  styleUrl: './media-controls.scss',
})
export class MediaDetail {
  readonly id = input.required<string>();
  readonly closed = output<void>();
  readonly changed = output<void>();
  readonly asset = signal<MediaResponse | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly deleteConfirmation = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly retryAfter = signal<string | null>(null);
  readonly size = fileSize;
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    alt_text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20000)],
    }),
  });
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly api = inject(MediaApi);
  private readonly destroyRef = inject(DestroyRef);
  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.load();
    });
  }
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api
      .detail(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (asset) => {
          this.asset.set(asset);
          this.form.reset({
            title: asset.title ?? '',
            alt_text: asset.alt_text ?? '',
            description: asset.description ?? '',
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.failure(error);
        },
      });
  }
  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || this.deleting() || !this.asset()) return;
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.form.disable();
    const value = this.form.getRawValue();
    this.api
      .update(this.id(), {
        title: value.title.trim() || null,
        alt_text: value.alt_text.trim() || null,
        description: value.description.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (asset) => {
          this.asset.set(asset);
          this.saving.set(false);
          this.form.enable();
          this.notice.set('Metadata guardada.');
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.form.enable();
          this.failure(error);
        },
      });
  }
  remove(): void {
    if (!this.deleteConfirmation() || this.saving() || this.deleting()) return;
    this.deleting.set(true);
    this.error.set('');
    this.api
      .delete(this.id())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleting.set(false);
          this.changed.emit();
          this.close();
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.failure(error, 'delete');
        },
      });
  }
  close(event?: Event): void {
    if (this.saving() || this.deleting()) {
      event?.preventDefault();
      return;
    }
    this.dialog().nativeElement.close();
    this.closed.emit();
  }
  private failure(error: unknown, context: 'general' | 'delete' = 'general'): void {
    this.error.set(mediaError(error, context));
    this.retryAfter.set(error instanceof ApiError ? error.retryAfter : null);
    if (error instanceof ApiError && error.status === 422)
      for (const issue of error.validationIssues) {
        const field = issue.loc.at(-1);
        if (field === 'title' || field === 'description' || field === 'alt_text')
          this.form.controls[field].setErrors({ backend: true });
      }
  }
}
