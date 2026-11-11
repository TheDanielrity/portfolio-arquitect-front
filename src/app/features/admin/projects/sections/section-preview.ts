import { Component, effect, inject, input, signal } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
import type {
  MediaResponse,
  SectionMediaResponse,
  SectionResponse,
} from '../../../../core/api/generated/types.gen';
import { MediaApi } from '../../media/media-api.service';
import { MediaPreview } from '../../media/media-preview';
import { allPages } from '../project-api.service';
import { ProjectDraft } from '../project-draft';
import { ProjectSectionsApi } from './project-sections-api.service';
import { SECTION_POLICY, sectionError } from './section-policy';

@Component({
  selector: 'app-section-preview',
  imports: [MediaPreview],
  template: `<div class="preview" [class.split]="section().section_type === 'SPLIT'">
    @if (section().content) {
      @if (section().section_type === 'QUOTE') {
        <blockquote>{{ section().content }}</blockquote>
      } @else {
        <p class="content">{{ section().content }}</p>
      }
    }
    @if (loading()) {
      <p role="status">Cargando vista previa…</p>
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      <button type="button" (click)="retry.update(increment)">Reintentar vista previa</button>
    }
    <div class="media" [class.gallery]="section().section_type === 'GALLERY'">
      @for (item of items(); track item.relation.media_id) {
        <figure>
          <app-media-preview [asset]="item.asset" [autoload]="true" />
          @if (item.relation.caption) {
            <figcaption>{{ item.relation.caption }}</figcaption>
          }
        </figure>
      }
    </div>
  </div>`,
  styleUrl: './section-preview.scss',
})
export class SectionPreview {
  readonly projectId = input.required<string>();
  readonly section = input.required<SectionResponse>();
  readonly items = signal<{ relation: SectionMediaResponse; asset: MediaResponse }[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly retry = signal(0);
  readonly increment = (value: number) => value + 1;
  private readonly api = inject(ProjectSectionsApi);
  private readonly media = inject(MediaApi);
  private readonly draft = inject(ProjectDraft, { optional: true });

  constructor() {
    effect((onCleanup) => {
      const section = this.section();
      const project = this.projectId();
      this.draft?.revision();
      this.retry();
      this.items.set([]);
      this.error.set('');
      if (!SECTION_POLICY[section.section_type].media) {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const request = allPages((offset) => this.api.media(project, section.id, offset))
        .pipe(
          switchMap((relations) =>
            relations.length
              ? forkJoin(
                  relations.map((relation) =>
                    this.media
                      .detail(relation.media_id)
                      .pipe(switchMap((asset) => of({ relation, asset }))),
                  ),
                )
              : of([]),
          ),
        )
        .subscribe({
          next: (items) => {
            this.items.set(items);
            this.loading.set(false);
          },
          error: (error) => {
            this.error.set(sectionError(error));
            this.loading.set(false);
          },
        });
      onCleanup(() => request.unsubscribe());
    });
  }
}
