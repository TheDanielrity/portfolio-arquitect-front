import { inject, Injectable } from '@angular/core';
import { defer, of, switchMap, tap } from 'rxjs';
import type {
  AttributeCreate,
  AttributeResponse,
  AttributeUpdate,
  MediaAttach,
  MediaLinkResponse,
  MediaLinkUpdate,
  Reorder,
} from '../../../core/api/generated/types.gen';
import { allPages, ProjectApi, Taxon, TaxonomyKind } from './project-api.service';
import { DraftCollection, ProjectDraft } from './project-draft';

/** Editor-only adapter. Public/list routes continue using the normal HTTP API. */
@Injectable()
export class ProjectDraftApi extends ProjectApi {
  private readonly draft = inject(ProjectDraft);
  private readonly attributesPreview = new DraftCollection<AttributeResponse>();
  private readonly mediaPreview = new DraftCollection<MediaLinkResponse>();
  private readonly taxonsPreview = new DraftCollection<Taxon>();

  constructor() {
    super();
    this.draft.onReset(() => {
      this.attributesPreview.clear();
      this.mediaPreview.clear();
      this.taxonsPreview.clear();
    });
  }

  override attributes(id: string, offset = 0) {
    return this.attributesPreview.list(id, offset, () => allPages((o) => super.attributes(id, o)));
  }

  override addAttribute(id: string, body: AttributeCreate) {
    return defer(() => {
      const now = new Date().toISOString();
      const item: AttributeResponse = {
        ...body,
        id: this.draft.temporaryId(),
        project_id: id,
        created_at: now,
        updated_at: now,
      };
      this.attributesPreview.set(id, [...this.attributesPreview.get(id), item]);
      return this.draft.stage(
        'Crear característica «' + body.label + '»',
        item,
        () =>
          super.addAttribute(id, body).pipe(tap((saved) => this.draft.identify(item.id, saved.id))),
        'attribute/' + id + '/' + item.id,
      );
    });
  }

  override updateAttribute(id: string, item: string, body: AttributeUpdate) {
    return defer(() => {
      const previous = this.attributesPreview.get(id).find((value) => value.id === item);
      if (!previous) throw new Error('No se encontró la característica.');
      if (
        Object.entries(body).every(
          ([key, value]) => previous[key as keyof AttributeResponse] === value,
        )
      )
        return of(previous);
      const preview = { ...previous, ...body };
      this.attributesPreview.set(
        id,
        this.attributesPreview.get(id).map((value) => (value.id === item ? preview : value)),
      );
      return this.draft.stage(
        'Editar característica «' + preview.label + '»',
        preview,
        () =>
          this.draft.isNew(item)
            ? super
                .addAttribute(id, {
                  label: preview.label,
                  value: preview.value,
                  sort_order: preview.sort_order,
                })
                .pipe(tap((saved) => this.draft.identify(item, saved.id)))
            : super.updateAttribute(id, this.draft.resolve(item), {
                label: preview.label,
                value: preview.value,
                sort_order: preview.sort_order,
              }),
        'attribute/' + id + '/' + item,
      );
    });
  }

  override deleteAttribute(id: string, item: string) {
    return defer(() => {
      this.attributesPreview.set(
        id,
        this.attributesPreview.get(id).filter((value) => value.id !== item),
      );
      const key = 'attribute/' + id + '/' + item;
      if (this.draft.isNew(item)) {
        this.draft.discard(key);
        return of(undefined);
      }
      return this.draft.stage(
        'Eliminar característica',
        undefined,
        () => super.deleteAttribute(id, this.draft.resolve(item)),
        key,
      );
    });
  }

  override taxons(kind: TaxonomyKind, offset = 0, projectId?: string) {
    const key = (projectId ?? 'available') + '/' + kind;
    return this.taxonsPreview.list(key, offset, () =>
      allPages((o) => super.taxons(kind, o, projectId)),
    );
  }

  override assign(id: string, kind: TaxonomyKind, ids: string[]) {
    return defer(() => {
      const selected = new Set(ids);
      this.taxonsPreview.set(
        id + '/' + kind,
        this.taxonsPreview.get('available/' + kind).filter((item) => selected.has(item.id)),
      );
      return this.draft.stage(
        'Guardar ' + (kind === 'categories' ? 'categorías' : 'etiquetas'),
        undefined,
        () => super.assign(id, kind, ids),
        id + '/' + kind,
      );
    });
  }

  override media(id: string, offset = 0) {
    return this.mediaPreview.list(id, offset, () => allPages((o) => super.media(id, o)));
  }

  override attach(id: string, body: MediaAttach) {
    return defer(() => {
      const item: MediaLinkResponse = {
        ...body,
        id: this.draft.temporaryId(),
        project_id: id,
        created_at: new Date().toISOString(),
      };
      this.mediaPreview.set(id, [...this.mediaPreview.get(id), item]);
      return this.draft.stage(
        'Añadir archivo al proyecto',
        item,
        () => super.attach(id, body).pipe(tap((saved) => this.draft.identify(item.id, saved.id))),
        'media/' + id + '/' + item.id,
      );
    });
  }

  override updateMedia(id: string, item: string, body: MediaLinkUpdate) {
    return defer(() => {
      const previous = this.mediaPreview.get(id).find((value) => value.id === item);
      if (!previous) throw new Error('No se encontró el archivo.');
      const preview = { ...previous, ...body };
      this.mediaPreview.set(
        id,
        this.mediaPreview.get(id).map((value) => (value.id === item ? preview : value)),
      );
      return this.draft.stage(
        'Editar archivo del proyecto',
        preview,
        () =>
          this.draft.isNew(item)
            ? super
                .attach(id, {
                  media_id: preview.media_id,
                  role: preview.role,
                  sort_order: preview.sort_order,
                })
                .pipe(tap((saved) => this.draft.identify(item, saved.id)))
            : super.updateMedia(id, this.draft.resolve(item), body),
        'media/' + id + '/' + item,
      );
    });
  }

  override detach(id: string, item: string) {
    return defer(() => {
      const previous = this.mediaPreview.get(id).find((value) => value.id === item);
      this.mediaPreview.set(
        id,
        this.mediaPreview.get(id).filter((value) => value.id !== item),
      );
      const isPendingCover = this.draft.isNew(item) && previous?.role === 'COVER';
      const key = isPendingCover ? 'cover/' + id : 'media/' + id + '/' + item;
      if (this.draft.isNew(item)) {
        this.draft.discard(key);
        // Removing a replacement cover also removes the original cover at final save.
        if (isPendingCover)
          return this.draft.stage(
            'Quitar portada',
            undefined,
            () =>
              allPages((offset) => super.media(id, offset)).pipe(
                switchMap((links) => {
                  const cover = links.find((link) => link.role === 'COVER');
                  return cover ? super.detach(id, cover.id) : of(undefined);
                }),
              ),
            key,
          );
        return of(undefined);
      }
      return this.draft.stage(
        'Quitar archivo del proyecto',
        undefined,
        () => super.detach(id, this.draft.resolve(item)),
        key,
      );
    });
  }

  override cover(id: string, mediaId: string) {
    return this.media(id).pipe(
      switchMap(() => {
        const item: MediaLinkResponse = {
          id: this.draft.temporaryId(),
          project_id: id,
          media_id: mediaId,
          role: 'COVER',
          sort_order: 0,
          created_at: new Date().toISOString(),
        };
        this.mediaPreview.set(id, [
          ...this.mediaPreview.get(id).filter((value) => value.role !== 'COVER'),
          item,
        ]);
        return this.draft.stage(
          'Cambiar portada del proyecto',
          item,
          () =>
            super.cover(id, mediaId).pipe(tap((saved) => this.draft.identify(item.id, saved.id))),
          'cover/' + id,
        );
      }),
    );
  }

  override order(id: string, kind: 'attributes' | 'media', body: Reorder) {
    return defer(() => {
      const apply = <T extends { id: string; sort_order?: number }>(items: T[]) =>
        items
          .map((item) => ({
            ...item,
            sort_order:
              body.items.find((entry) => entry.id === item.id)?.sort_order ?? item.sort_order,
          }))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      if (kind === 'attributes')
        this.attributesPreview.set(id, apply(this.attributesPreview.get(id)));
      else this.mediaPreview.set(id, apply(this.mediaPreview.get(id)));
      return this.draft.stage(
        'Ordenar ' + (kind === 'attributes' ? 'características' : 'archivos'),
        undefined,
        () => {
          const items = (
            kind === 'attributes' ? this.attributesPreview.get(id) : this.mediaPreview.get(id)
          )
            .slice(body.items[0]?.sort_order ?? 0, (body.items[0]?.sort_order ?? 0) + 100)
            .map((item, index) => ({
              id: this.draft.resolve(item.id),
              sort_order: (body.items[0]?.sort_order ?? 0) + index,
            }));
          return items.length ? super.order(id, kind, { items }) : of(undefined);
        },
        kind + '/' + id + '/order/' + (body.items[0]?.sort_order ?? 0),
        1,
      );
    });
  }
}
