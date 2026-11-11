import { inject, Injectable } from '@angular/core';
import { defer, of, switchMap, tap } from 'rxjs';
import type { MediaResponse, MediaUpdate } from '../../../core/api/generated/types.gen';
import { MediaApi } from '../media/media-api.service';
import { ProjectDraft } from './project-draft';

/** Only metadata is staged; authorization, PUT and confirmation keep their existing contract. */
@Injectable()
export class ProjectMediaDraftApi extends MediaApi {
  private readonly draft = inject(ProjectDraft);
  private readonly assets = new Map<string, MediaResponse>();

  constructor() {
    super();
    this.draft.onReset(() => this.assets.clear());
  }

  override detail(id: string) {
    return defer(() => {
      const asset = this.assets.get(id);
      return asset ? of(asset) : super.detail(id).pipe(tap((value) => this.assets.set(id, value)));
    });
  }

  override update(id: string, body: Pick<MediaUpdate, 'title' | 'description' | 'alt_text'>) {
    return this.detail(id).pipe(
      switchMap((asset) => {
        if (
          Object.entries(body).every(([key, value]) => asset[key as keyof MediaResponse] === value)
        )
          return of(asset);
        const preview = { ...asset, ...body };
        this.assets.set(id, preview);
        return this.draft.stage(
          'Guardar detalles del archivo «' + asset.original_filename + '»',
          preview,
          () =>
            super.update(id, {
              title: preview.title,
              alt_text: preview.alt_text,
              description: preview.description,
            }),
          'asset/' + id,
        );
      }),
    );
  }
}
