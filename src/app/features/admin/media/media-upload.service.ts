import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Subscription, TimeoutError } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import type { MediaResponse, UploadResponse } from '../../../core/api/generated/types.gen';
import { MediaApi } from './media-api.service';
import { mediaError } from './media-errors';
import { isStl, validateFile } from './media-policy';
import { StlConverter } from './stl-converter';
import { StlFileReadError } from './stl-file';
export type UploadStage =
  | 'selected'
  | 'converting'
  | 'authorizing'
  | 'uploading'
  | 'confirming'
  | 'completed'
  | 'failed'
  | 'cancelling'
  | 'cancelled';
@Injectable()
export class MediaUpload implements OnDestroy {
  private readonly api = inject(MediaApi);
  private readonly converter = inject(StlConverter);
  readonly stage = signal<UploadStage>('selected');
  readonly access = signal<'private' | 'public'>('private');
  readonly file = signal<File | null>(null);
  readonly progress = signal<number | null>(null);
  readonly conversionProgress = signal<number | null>(null);
  readonly requiresFileSelection = signal(false);
  readonly error = signal('');
  readonly retryAfter = signal<string | null>(null);
  readonly asset = signal<MediaResponse | null>(null);
  private authorization: UploadResponse | null = null;
  private transfer?: Subscription;
  private conversion?: Subscription;
  private cancellationRequested = false;
  private destroyed = false;
  private putCompleted = false;
  get busy(): boolean {
    return ['converting', 'authorizing', 'uploading', 'confirming', 'cancelling'].includes(
      this.stage(),
    );
  }
  get canConfirm(): boolean {
    return this.putCompleted && !!this.authorization && this.stage() === 'failed';
  }
  get unresolved(): boolean {
    return !!this.authorization && !['completed', 'cancelled'].includes(this.stage());
  }
  select(file: File): void {
    if (this.busy || this.unresolved) return;
    this.file.set(file);
    this.asset.set(null);
    this.error.set('');
    this.retryAfter.set(null);
    this.progress.set(null);
    this.conversionProgress.set(null);
    this.requiresFileSelection.set(false);
    this.authorization = null;
    this.putCompleted = false;
    this.cancellationRequested = false;
    try {
      validateFile(file);
      this.stage.set('selected');
    } catch (error) {
      this.stage.set('failed');
      this.error.set(error instanceof Error ? error.message : 'Archivo no válido.');
    }
  }
  retry(): void {
    if (this.requiresFileSelection()) return;
    const file = this.file();
    if (!file || this.busy || this.unresolved || !['failed', 'cancelled'].includes(this.stage()))
      return;
    this.select(file);
    if (this.stage() === 'selected') this.start();
  }
  start(): void {
    const file = this.file();
    if (!file || this.busy || this.unresolved || this.stage() !== 'selected') return;
    if (isStl(file)) {
      this.stage.set('converting');
      this.error.set('');
      this.conversionProgress.set(0);
      this.conversion = this.converter.convert(file).subscribe({
        next: (event) => {
          if (this.destroyed || this.cancellationRequested) return;
          if ('progress' in event) this.conversionProgress.set(event.progress);
          else {
            try {
              this.authorize(event.file);
            } catch (error) {
              this.fail(error);
            }
          }
        },
        error: (error: unknown) => {
          this.requiresFileSelection.set(error instanceof StlFileReadError);
          this.fail(error);
        },
      });
      return;
    }
    this.authorize(file);
  }
  private authorize(file: File): void {
    // Only the actual GLB bytes and their size reach the unchanged API.
    if (isStl(file)) throw new Error('Convierte el STL antes de subirlo.');
    const body = { ...validateFile(file), access: this.access() };
    this.stage.set('authorizing');
    this.error.set('');
    this.retryAfter.set(null);
    this.api.presign(body).subscribe({
      next: (authorization) => {
        this.authorization = authorization;
        if (this.cancellationRequested || this.destroyed) {
          this.revoke();
          return;
        }
        if (
          Date.parse(authorization.expires_at) <= Date.now() ||
          file.size > authorization.max_file_size
        ) {
          this.fail(
            new Error(
              'La autorización ha expirado o el archivo supera el límite del servidor. Cancela y vuelve a seleccionar el archivo.',
            ),
          );
          return;
        }
        this.stage.set('uploading');
        this.transfer = this.api.put(authorization, file).subscribe({
          next: (event) => {
            if (event.type === HttpEventType.UploadProgress && event.total)
              this.progress.set(Math.min(100, Math.round((event.loaded / event.total) * 100)));
            if (event.type === HttpEventType.Response) {
              this.putCompleted = true;
              this.confirm();
            }
          },
          error: (error: unknown) => {
            const expired = Date.parse(authorization.expires_at) <= Date.now();
            this.fail(
              new Error(
                expired
                  ? 'La autorización ha expirado. Cancela y solicita una nueva subida.'
                  : error instanceof TimeoutError
                    ? 'La transferencia no respondió durante dos minutos. Comprueba la conexión, cancela esta autorización y vuelve a intentar con una nueva. El archivo todavía no está confirmado.'
                    : error instanceof HttpErrorResponse && error.status === 0
                      ? 'No se pudo completar la conexión con el almacenamiento. El archivo no está confirmado. Comprueba la conexión y vuelve a intentar la subida.'
                      : 'El almacenamiento rechazó la transferencia. Cancela esta autorización antes de volver a subir.',
              ),
            );
          },
        });
      },
      error: (error: unknown) => {
        if (this.cancellationRequested) this.stage.set('cancelled');
        else this.fail(error);
      },
    });
  }
  confirm(): void {
    if (
      !this.authorization ||
      !this.putCompleted ||
      this.stage() === 'confirming' ||
      this.stage() === 'completed'
    )
      return;
    this.stage.set('confirming');
    this.error.set('');
    this.retryAfter.set(null);
    this.api.confirm(this.authorization.upload_id).subscribe({
      next: (asset) => {
        this.asset.set(asset);
        this.stage.set('completed');
      },
      error: (error: unknown) => this.fail(error, 'confirm'),
    });
  }
  cancel(): void {
    if (['completed', 'cancelled', 'cancelling', 'confirming'].includes(this.stage())) return;
    this.cancellationRequested = true;
    this.conversion?.unsubscribe();
    this.transfer?.unsubscribe();
    if (this.stage() === 'authorizing') {
      this.stage.set('cancelling');
      return;
    }
    if (this.authorization) this.revoke();
    else {
      this.stage.set('cancelled');
      this.error.set('');
    }
  }
  private revoke(): void {
    if (!this.authorization) return;
    this.stage.set('cancelling');
    this.api.cancel(this.authorization.upload_id).subscribe({
      next: () => {
        this.stage.set('cancelled');
        this.error.set('');
        this.authorization = null;
        this.putCompleted = false;
      },
      error: (error: unknown) => this.fail(error),
    });
  }
  private fail(error: unknown, context: 'general' | 'confirm' = 'general'): void {
    this.stage.set('failed');
    this.error.set(
      error instanceof ApiError
        ? mediaError(error, context)
        : error instanceof Error
          ? error.message
          : mediaError(error),
    );
    this.retryAfter.set(error instanceof ApiError ? error.retryAfter : null);
  }
  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancel();
  }
}
