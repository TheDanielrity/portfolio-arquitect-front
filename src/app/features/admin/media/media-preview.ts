import { mediaTypeLabel } from './media-policy';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { MediaApi } from './media-api.service';
import { MediaBrowser } from './media-browser.service';
import { mediaError } from './media-errors';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
@Component({
  selector: 'app-media-preview',
  template: `
    <div
      class="preview"
      [class.cover]="cover()"
      [class.panoramic]="panoramic()"
      [class.portrait]="portrait()"
      [class.contain]="fit() === 'contain'"
    >
      @if (displayUrl() && asset().type === 'IMAGE') {
        <img
          [src]="displayUrl()"
          [alt]="asset().alt_text || asset().title || asset().original_filename"
          (error)="imageError()"
        />
      } @else {
        <span class="file-type">{{ typeLabel(asset().type) }}</span>
      }
      @if (controls() && asset().type === 'IMAGE' && !displayUrl()) {
        <button type="button" (click)="load(false)" [disabled]="loading()">
          {{ loading() ? 'Cargando…' : 'Ver imagen' }}
        </button>
      }
    </div>
    @if (downloadable()) {
      <button type="button" (click)="load(true)" [disabled]="loading()">
        {{ loading() ? 'Preparando archivo…' : 'Descargar archivo' }}
      </button>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
  styleUrl: './media-preview.scss',
})
export class MediaPreview {
  readonly typeLabel = mediaTypeLabel;
  readonly asset = input.required<MediaResponse>();
  readonly downloadable = input(false);
  readonly autoload = input(false);
  readonly cover = input(false);
  readonly fit = input<'cover' | 'contain'>('cover');
  readonly panoramic = input(false);
  readonly portrait = input(false);
  readonly controls = input(true);
  readonly url = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly api = inject(MediaApi);
  private readonly browser = inject(MediaBrowser);
  private readonly destroyRef = inject(DestroyRef);
  private renewed = false;
  private currentId: string | null = null;
  private request?: Subscription;
  readonly externalUrl = computed(() => this.api.externalContentUrl(this.asset(), true));
  readonly displayUrl = computed(() => this.url() || this.externalUrl());
  constructor() {
    this.destroyRef.onDestroy(() => this.browser.revoke(this.url()));
    effect(() => {
      const id = this.asset().id;
      const autoload = this.autoload();
      if (this.currentId === id) {
        if (autoload && this.asset().type === 'IMAGE')
          untracked(() => {
            if (!this.displayUrl() && !this.loading() && !this.error()) this.load(false);
          });
        return;
      }
      this.currentId = id;
      this.request?.unsubscribe();
      untracked(() => this.browser.revoke(this.url()));
      this.url.set(null);
      this.error.set('');
      this.renewed = false;
      this.loading.set(false);
      if (autoload && this.asset().type === 'IMAGE') untracked(() => this.load(false));
    });
  }
  load(download: boolean): void {
    if (this.loading()) return;
    const externalUrl = this.api.externalContentUrl(this.asset());
    if (externalUrl) {
      const url = externalUrl;
      if (download && url) this.browser.download(url, this.asset().original_filename);
      return;
    }
    if (download && this.url()) {
      this.browser.download(this.url()!, this.asset().original_filename);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const id = this.asset().id;
    this.request = this.api
      .content(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.loading.set(false);
          if (this.asset().id !== id) return;
          this.browser.revoke(this.url());
          this.url.set(this.browser.create(blob));
          if (download && this.url())
            this.browser.download(this.url()!, this.asset().original_filename);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(mediaError(error));
        },
      });
  }
  imageError(): void {
    if (this.externalUrl()) {
      this.error.set('La vista previa externa no está disponible.');
      return;
    }
    this.browser.revoke(this.url());
    this.url.set(null);
    if (!this.renewed) {
      this.renewed = true;
      this.load(false);
    } else
      this.error.set('No se puede mostrar la imagen. Puedes descargar el archivo para revisarlo.');
  }
}
