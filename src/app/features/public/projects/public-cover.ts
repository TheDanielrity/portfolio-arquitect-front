import { Component, computed, effect, inject, input, signal } from '@angular/core';
import type { PublicMedia } from '../../../core/api/generated/types.gen';
import { PublicMediaDelivery } from '../project-detail/public-media-delivery';
@Component({
  selector: 'app-public-cover',
  host: { '[attr.aria-busy]': '!!source() && !failed() && !loaded()' },
  template: `@if (source() && !failed()) {
      <img
        [src]="source()!"
        [alt]="media()?.alt_text || title()"
        [attr.width]="media()?.width"
        [attr.height]="media()?.height"
        [attr.loading]="priority() ? 'eager' : 'lazy'"
        [attr.fetchpriority]="priority() ? 'high' : 'auto'"
        decoding="async"
        (load)="loaded.set(true)"
        (error)="failed.set(true)"
        [class.loaded]="loaded()"
        [style.object-fit]="fit()"
      />
    } @else {
      <span class="fallback">{{
        failed() ? 'Imagen no disponible' : 'Sin imagen de portada'
      }}</span>
    }`,
  styles: `
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      background: var(--public-muted);
      overflow: hidden;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .fallback {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      text-align: center;
      color: var(--public-muted-foreground);
      font: 10px var(--public-font-mono);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
  `,
})
export class PublicCover {
  private readonly delivery = inject(PublicMediaDelivery);
  constructor() {
    effect(() => {
      this.source();
      this.failed.set(false);
      this.loaded.set(false);
    });
  }
  readonly media = input<PublicMedia | null>(null);
  readonly title = input('');
  readonly priority = input(false);
  readonly thumbnail = input(true);
  readonly fit = input<'cover' | 'fill'>('cover');
  readonly failed = signal(false);
  readonly loaded = signal(false);
  readonly source = computed(() => {
    const m = this.media();
    return m?.type === 'IMAGE' ? this.delivery.url(m, this.thumbnail()) : null;
  });
}
