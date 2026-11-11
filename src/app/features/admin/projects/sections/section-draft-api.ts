import { inject, Injectable } from '@angular/core';
import { defer, of, tap } from 'rxjs';
import type {
  Reorder,
  SectionCreate,
  SectionResponse,
  SectionUpdate,
  SectionMediaResponse,
} from '../../../../core/api/generated/types.gen';
import { allPages } from '../project-api.service';
import { DraftCollection, ProjectDraft } from '../project-draft';
import { ProjectSectionsApi } from './project-sections-api.service';

@Injectable()
export class SectionDraftApi extends ProjectSectionsApi {
  private readonly draft = inject(ProjectDraft);
  private readonly preview = new DraftCollection<SectionResponse>();
  private readonly mediaPreview = new DraftCollection<SectionMediaResponse>();
  constructor() {
    super();
    this.draft.onReset(() => {
      this.preview.clear();
      this.mediaPreview.clear();
    });
  }

  override list(project: string, offset = 0) {
    return this.preview.list(project, offset, () => allPages((o) => super.list(project, o)));
  }

  override detail(project: string, section: string) {
    return defer(() => {
      const item = this.preview.get(project).find((value) => value.id === section);
      return item ? of(item) : super.detail(project, this.draft.resolve(section));
    });
  }

  override media(project: string, section: string, offset = 0) {
    return this.mediaPreview.list(project + '/' + section, offset, () =>
      allPages((o) => super.media(project, this.draft.resolve(section), o)),
    );
  }

  private setMedia(
    project: string,
    section: string,
    media: NonNullable<SectionCreate['media']>,
  ): void {
    const key = project + '/' + section;
    this.mediaPreview.set(
      key,
      media.map((item) => ({ ...item, section_id: section, created_at: new Date().toISOString() })),
    );
  }

  override create(project: string, body: SectionCreate) {
    return defer(() => {
      const now = new Date().toISOString();
      const item: SectionResponse = {
        id: this.draft.temporaryId(),
        project_id: project,
        section_type: body.section_type,
        title: body.title ?? null,
        content: body.content ?? null,
        sort_order: body.sort_order ?? 0,
        is_visible: body.is_visible ?? true,
        created_at: now,
        updated_at: now,
      };
      this.preview.set(project, [...this.preview.get(project), item]);
      this.setMedia(project, item.id, body.media ?? []);
      return this.draft.stage(
        'Crear sección «' + (item.title || item.section_type) + '»',
        item,
        () =>
          super.create(project, body).pipe(tap((saved) => this.draft.identify(item.id, saved.id))),
        'section/' + project + '/' + item.id,
      );
    });
  }

  override update(project: string, section: string, body: SectionUpdate) {
    return defer(() => {
      const previous = this.preview.get(project).find((value) => value.id === section);
      if (!previous) throw new Error('No se encontró la sección.');
      const { media, ...fields } = body;
      const normalizeMedia = (items: NonNullable<SectionUpdate['media']>) =>
        JSON.stringify(
          items.map((item) => ({
            media_id: item.media_id,
            sort_order: item.sort_order ?? 0,
            caption: item.caption ?? null,
          })),
        );
      const sameFields = Object.entries(fields).every(
        ([key, value]) => previous[key as keyof SectionResponse] === value,
      );
      const sameMedia =
        media === undefined ||
        (this.mediaPreview.has(project + '/' + section) &&
          normalizeMedia(media) === normalizeMedia(this.mediaPreview.get(project + '/' + section)));
      if (sameFields && sameMedia) return of(previous);
      const item: SectionResponse = { ...previous, ...fields };
      this.preview.set(
        project,
        this.preview.get(project).map((value) => (value.id === section ? item : value)),
      );
      if (media) this.setMedia(project, section, media);
      const complete: SectionCreate = {
        section_type: item.section_type,
        title: item.title,
        content: item.content,
        is_visible: item.is_visible,
        sort_order: item.sort_order,
        media: this.mediaPreview.has(project + '/' + section)
          ? this.mediaPreview
              .get(project + '/' + section)
              .map(({ media_id, sort_order, caption }) => ({ media_id, sort_order, caption }))
          : undefined,
      };
      return this.draft.stage(
        'Editar sección «' + (item.title || item.section_type) + '»',
        item,
        () =>
          this.draft.isNew(section)
            ? super
                .create(project, complete)
                .pipe(tap((saved) => this.draft.identify(section, saved.id)))
            : super.update(project, this.draft.resolve(section), complete),
        'section/' + project + '/' + section,
      );
    });
  }

  override delete(project: string, section: string) {
    return defer(() => {
      this.preview.set(
        project,
        this.preview.get(project).filter((value) => value.id !== section),
      );
      const key = 'section/' + project + '/' + section;
      this.draft.discard('section-media-order/' + project + '/' + section);
      if (this.draft.isNew(section)) {
        this.draft.discard(key);
        return of(undefined);
      }
      return this.draft.stage(
        'Eliminar sección',
        undefined,
        () => super.delete(project, this.draft.resolve(section)),
        key,
      );
    });
  }

  override order(project: string, body: Reorder) {
    return defer(() => {
      this.preview.set(
        project,
        this.preview
          .get(project)
          .map((item) => ({
            ...item,
            sort_order:
              body.items.find((entry) => entry.id === item.id)?.sort_order ?? item.sort_order,
          }))
          .sort((a, b) => a.sort_order - b.sort_order),
      );
      return this.draft.stage(
        'Ordenar secciones',
        undefined,
        () => {
          const items = this.preview
            .get(project)
            .slice(body.items[0]?.sort_order ?? 0, (body.items[0]?.sort_order ?? 0) + 100)
            .map((item, index) => ({
              id: this.draft.resolve(item.id),
              sort_order: (body.items[0]?.sort_order ?? 0) + index,
            }));
          return items.length ? super.order(project, { items }) : of(undefined);
        },
        'section-order/' + project + '/' + (body.items[0]?.sort_order ?? 0),
        1,
      );
    });
  }

  override orderMedia(project: string, section: string, body: Reorder) {
    return defer(() => {
      const key = project + '/' + section;
      this.mediaPreview.set(
        key,
        this.mediaPreview
          .get(key)
          .map((item) => ({
            ...item,
            sort_order:
              body.items.find((entry) => entry.id === item.media_id)?.sort_order ?? item.sort_order,
          }))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      );
      return this.draft.stage(
        'Ordenar archivos de la sección',
        undefined,
        () =>
          super.orderMedia(project, this.draft.resolve(section), {
            items: this.mediaPreview
              .get(key)
              .map((item, index) => ({ id: item.media_id, sort_order: index })),
          }),
        'section-media-order/' + project + '/' + section,
        1,
      );
    });
  }
}
