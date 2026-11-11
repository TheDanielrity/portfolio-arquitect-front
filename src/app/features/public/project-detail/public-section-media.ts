import { Component, computed, effect, input, signal } from '@angular/core';
import type { PublicSectionMedia } from '../../../core/api/generated/types.gen';
import { PublicCover } from '../projects/public-cover';
import { PublicModel } from './public-model';

@Component({
  selector: 'app-public-section-media',
  imports: [PublicCover, PublicModel],
  template: `<figure>
    @switch (media().asset.type) {
      @case ('IMAGE') {
        <div class="image" [style.aspect-ratio]="ratio()">
          <app-public-cover [media]="media().asset" [title]="title()" />
        </div>
      }
      @case ('VIDEO') {
        @if (failed()) {
          <div class="fallback" role="alert">
            <p>No se pudo cargar el vídeo.</p>
            <button type="button" (click)="failed.set(false)">Reintentar vídeo</button>
          </div>
        } @else {
          <video
            controls
            preload="none"
            playsinline
            [attr.poster]="media().asset.thumbnail_url"
            [attr.aria-label]="media().asset.title || title() || 'Vídeo del proyecto'"
            (error)="failed.set(true)"
          >
            <source
              [src]="media().asset.url"
              [type]="media().asset.mime_type"
              (error)="failed.set(true)"
            />
            Tu navegador no puede reproducir este vídeo.
          </video>
        }
      }
      @case ('MODEL_3D') {
        <app-public-model [media]="media().asset" />
      }
      @case ('DOCUMENT') {
        <a [href]="media().asset.url" target="_blank" rel="noopener"
          >{{ media().asset.title || title() || 'Documento del proyecto' }} ↗</a
        >
      }
      @default {
        <p role="status">Este formato de archivo no está disponible.</p>
      }
    }
    @if (media().caption) {
      <figcaption>{{ media().caption }}</figcaption>
    }
  </figure>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    figure {
      margin: 0;
    }
    .image {
      position: relative;
      overflow: hidden;
      background: var(--public-border);
    }
    app-public-cover {
      position: absolute;
      inset: 0;
    }
    video {
      display: block;
      width: 100%;
      aspect-ratio: 16/9;
      background: var(--public-dark);
    }
    figcaption {
      font: 400 10px/1.7 var(--public-font-mono);
      margin-top: 16px;
      color: var(--public-muted-foreground);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .fallback {
      min-height: 240px;
      display: grid;
      place-content: center;
      background: var(--public-border);
    }
  `,
})
export class PublicSectionMediaView {
  readonly media = input.required<PublicSectionMedia>();
  readonly title = input('');
  readonly failed = signal(false);
  constructor() {
    effect(() => {
      this.media();
      this.failed.set(false);
    });
  }
  readonly ratio = computed(() => {
    const media = this.media().asset;
    return media.width && media.height ? media.width / media.height : 16 / 10;
  });
}
