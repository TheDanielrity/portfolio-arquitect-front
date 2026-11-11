import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
import { validateFile } from './media-policy';
import { MediaUpload } from './media-upload.service';
import { MEDIA_ACCEPT, MEDIA_UPLOAD_LIMITS, fileSize } from './media-policy';
@Component({
  selector: 'app-media-upload',
  providers: [MediaUpload],
  template: `
    <section
      [attr.aria-label]="compact() ? 'Estado de subida del archivo' : null"
      [attr.aria-labelledby]="compact() ? null : 'upload-title'"
      class="upload-panel"
      [class.compact]="compact()"
    >
      @if (!compact()) {
        <div class="section-heading">
          <h2 id="upload-title">
            {{ target() === 'photo' ? 'Subir fotografía de perfil' : 'Subir CV' }}
          </h2>
          <span>{{
            upload.access() === 'private' ? 'Acceso privado' : 'Uso público condicionado'
          }}</span>
        </div>
        <p>{{ target() === 'photo' ? 'JPEG, PNG, WebP y AVIF.' : 'PDF.' }}</p>
        <p>{{ limits }}</p>
        <label for="upload-access">Uso del archivo</label>
        <select
          id="upload-access"
          [value]="upload.access()"
          (change)="accessChanged($event)"
          [disabled]="upload.busy || upload.unresolved"
          aria-describedby="access-help"
        >
          <option value="private">Privado: acceso administrativo</option>
          <option value="public">Público: disponible al asociarlo a contenido publicado</option>
        </select>
        <p id="access-help">
          El acceso público requiere que uses el archivo en contenido publicado y que el sistema
          confirme los permisos.
        </p>
        <label for="media-file">Selecciona un archivo</label>
        <input
          id="media-file"
          type="file"
          [accept]="target() === 'photo' ? '.jpg,.jpeg,.png,.webp,.avif' : '.pdf'"
          [disabled]="upload.busy || upload.unresolved"
          (change)="select($event)"
          aria-describedby="upload-help upload-error"
        />
        <p id="upload-help">
          Un archivo por subida. El servidor verifica el formato y el límite definitivo.
        </p>
      }
      @if (upload.file(); as file) {
        <div class="upload-status" role="status" aria-live="polite">
          <strong>{{ file.name }}</strong
          ><span>{{ size(file.size) }} · {{ stageLabel() }}</span>
        </div>
        @if (upload.stage() === 'uploading') {
          @let value = upload.progress();
          @if (value !== null) {
            <progress max="100" [value]="value" aria-label="Progreso de subida">
              {{ value }}%
            </progress>
          } @else {
            <progress aria-label="Subida en curso"></progress>
          }
        }
        <div class="actions">
          @if (upload.stage() === 'selected') {
            <button type="button" class="primary" (click)="upload.start()">Subir archivo</button>
          }
          @if (upload.canConfirm) {
            <button type="button" (click)="upload.confirm()">Reintentar confirmación</button>
          }
          @if (!['completed', 'cancelled'].includes(upload.stage())) {
            <button
              type="button"
              (click)="upload.cancel()"
              [disabled]="upload.stage() === 'confirming' || upload.stage() === 'cancelling'"
            >
              {{ upload.stage() === 'cancelling' ? 'Cancelando…' : 'Cancelar' }}
            </button>
          }
          @if (
            upload.stage() === 'cancelled' || (upload.stage() === 'failed' && !upload.unresolved)
          ) {
            <button type="button" (click)="upload.retry()">
              Reintentar con nueva autorización
            </button>
          }
          @if (upload.stage() === 'completed') {
            <p role="status">Archivo confirmado. Guarda el perfil para conservar su asociación.</p>
          }
        </div>
      }
      <p id="upload-error" role="alert" class="error">{{ upload.error() }}</p>
      @if (upload.retryAfter(); as retry) {
        <p>Reintenta después de: {{ retry }}</p>
      }
    </section>
  `,
  styleUrl: './media-controls.scss',
})
export class MediaUploadPanel {
  readonly upload = inject(MediaUpload);
  readonly completed = output<MediaResponse>();
  readonly target = input.required<'photo' | 'cv'>();
  readonly compact = input(false);
  readonly selectedFile = input<File | null>(null);
  constructor() {
    this.upload.access.set('public');
    effect(() => {
      const file = this.selectedFile();
      if (file) untracked(() => this.selectFile(file));
    });
    effect(() => {
      const asset = this.upload.asset();
      if (this.upload.stage() === 'completed' && asset) untracked(() => this.completed.emit(asset));
    });
  }
  readonly accept = MEDIA_ACCEPT;
  readonly limits = MEDIA_UPLOAD_LIMITS;
  readonly size = fileSize;
  readonly stageLabel = computed(
    () =>
      ({
        selected: 'Preparado',
        converting: `Convirtiendo STL a GLB… ${this.upload.conversionProgress() ?? 0}%`,
        authorizing: 'Solicitando autorización…',
        uploading:
          this.upload.progress() === null
            ? 'Conectando con el almacenamiento…'
            : this.upload.progress() === 100
              ? 'Archivo enviado; esperando respuesta del almacenamiento…'
              : `Subiendo… ${this.upload.progress()}%`,
        confirming: 'Verificando…',
        completed: 'Confirmado',
        failed: 'No completado',
        cancelling: 'Cancelando…',
        cancelled: 'Cancelado',
      })[this.upload.stage()],
  );
  accessChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (!this.upload.busy && !this.upload.unresolved && (value === 'private' || value === 'public'))
      this.upload.access.set(value);
  }
  select(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.selectFile(file);
    (event.target as HTMLInputElement).value = '';
  }
  private selectFile(file: File): void {
    if (this.upload.busy || this.upload.unresolved) return;
    try {
      const mime = validateFile(file).mime_type;
      if (this.target() === 'photo' ? !mime.startsWith('image/') : mime !== 'application/pdf') {
        this.upload.error.set('Selecciona una imagen para la foto o un PDF para el CV.');
        return;
      }
      this.upload.select(file);
      if (this.compact() && this.upload.stage() === 'selected') this.upload.start();
    } catch (error) {
      this.upload.error.set(error instanceof Error ? error.message : 'Archivo no válido.');
    }
  }
}
