import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
import { MediaApi } from '../media/media-api.service';
import { MediaPreview } from '../media/media-preview';
import { allPages, ProjectApi } from './project-api.service';

/** Private cover delivery; project list responses intentionally contain no storage URLs. */
@Component({
  selector: 'app-project-cover',
  imports: [MediaPreview],
  template: `@if (asset(); as cover) {
      <app-media-preview
        [asset]="cover"
        [autoload]="true"
        [cover]="true"
        fit="contain"
        [controls]="false"
      />
    } @else {
      <div class="fallback">
        <svg aria-hidden="true" viewBox="0 0 80 70" fill="none" stroke="currentColor">
          <path d="M12 59h56M20 59V24l23-14 19 14v35M20 24h42M29 59V36h11v23M47 35h8v10h-8" /></svg
        ><span>{{ loading() ? 'Cargando portada…' : 'Sin vista previa' }}</span>
      </div>
    }`,
  styles: `
    :host {
      display: block;
      min-width: 0;
      width: 100%;
      background: var(--admin-hover);
      aspect-ratio: 16/10;
      overflow: hidden;
      border-radius: 6px 6px 0 0;
    }
    app-media-preview {
      display: block;
      height: 100%;
    }
    .fallback {
      height: 100%;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 0.5rem;
      color: var(--admin-muted);
      font-size: 0.7rem;
    }
    svg {
      width: 4rem;
      height: 4rem;
    }
  `,
})
export class ProjectCover {
  readonly projectId = input.required<string>();
  readonly asset = signal<MediaResponse | null>(null);
  readonly loading = signal(false);
  private readonly projects = inject(ProjectApi);
  private readonly media = inject(MediaApi);
  private readonly destroy = inject(DestroyRef);
  constructor() {
    effect((cleanup) => {
      const id = this.projectId();
      this.asset.set(null);
      this.loading.set(true);
      const request = allPages((offset) => this.projects.media(id, offset))
        .pipe(
          switchMap((links) => {
            const cover = links.find((link) => link.role === 'COVER');
            return cover ? this.media.detail(cover.media_id) : of(null);
          }),
          catchError(() => of(null)),
          takeUntilDestroyed(this.destroy),
        )
        .subscribe((asset) => {
          this.asset.set(asset);
          this.loading.set(false);
        });
      cleanup(() => request.unsubscribe());
    });
  }
}
