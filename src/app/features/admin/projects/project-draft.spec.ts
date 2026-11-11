import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  AttributeResponse,
  MediaResponse,
  ProjectResponse,
  SectionResponse,
} from '../../../core/api/generated/types.gen';
import { ContentApi } from '../content/content-api.service';
import { MediaApi } from '../media/media-api.service';
import { ProjectApi } from './project-api.service';
import { ProjectDraft } from './project-draft';
import { ProjectDraftApi } from './project-draft-api';
import { ProjectMediaDraftApi } from './project-media-draft-api';
import { ProjectEditor } from './project-editor';
import { ProjectSectionsApi } from './sections/project-sections-api.service';
import { SectionDraftApi } from './sections/section-draft-api';
import { ProjectSections } from './sections/project-sections';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';

const base = 'https://api.test/api/v1/admin';
const project: ProjectResponse = {
  id: 'p',
  title: 'Casa Patio',
  slug: 'casa-patio',
  status: 'DRAFT',
  visibility: 'PRIVATE',
  published_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const attribute: AttributeResponse = {
  id: 'a',
  project_id: 'p',
  label: 'Material',
  value: 'Piedra',
  sort_order: 0,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const section: SectionResponse = {
  id: 's',
  project_id: 'p',
  section_type: 'TEXT',
  title: 'Concepto',
  content: 'Un patio central',
  sort_order: 0,
  is_visible: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const asset: MediaResponse = {
  id: 'm',
  original_filename: 'patio.png',
  type: 'IMAGE',
  storage_provider: 'r2',
  storage_key: 'patio',
  url: 'https://media.test/patio.png',
  thumbnail_url: null,
  mime_type: 'image/png',
  file_size: 10,
  width: 1,
  height: 1,
  title: null,
  alt_text: null,
  description: null,
  metadata: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

describe('Project editing drafts', () => {
  let http: HttpTestingController;
  let api: ProjectApi;
  let sections: ProjectSectionsApi;
  let draft: ProjectDraft;
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ProjectDraft,
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: ProjectApi, useClass: ProjectDraftApi },
        { provide: ProjectSectionsApi, useClass: SectionDraftApi },
        { provide: MediaApi, useClass: ProjectMediaDraftApi },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ProjectApi);
    sections = TestBed.inject(ProjectSectionsApi);
    draft = TestBed.inject(ProjectDraft);
  });
  afterEach(() => http.verify());
  function page(path: string, items: unknown[] = []) {
    http
      .expectOne((request) => request.url === base + path)
      .flush({ items, total: items.length, limit: 100, offset: 0 });
  }
  function attributes(items: AttributeResponse[] = []) {
    api.attributes('p').subscribe();
    page('/projects/p/attributes', items);
  }
  function sectionList(items: SectionResponse[] = []) {
    sections.list('p').subscribe();
    page('/projects/p/sections', items);
  }
  it('stages a section drag across several positions and writes only on final project save', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    page('/projects/p/sections', [
      section,
      { ...section, id: 'second', sort_order: 1 },
      { ...section, id: 'third', sort_order: 2 },
    ]);
    const e = f.componentInstance;
    e.toggleOrdering();
    e.drop({ previousIndex: 2, currentIndex: 0 } as CdkDragDrop<SectionResponse[]>);
    expect(e.sections().map((item) => item.id)).toEqual(['third', 's', 'second']);
    expect(draft.pending()).toBe(true);
    expect(e.notice()).toContain('Guarda los cambios del proyecto');
    http.expectNone((request) => request.method !== 'GET');
    draft.commit().subscribe();
    const request = http.expectOne(base + '/projects/p/sections/order');
    expect(request.request.body.items).toEqual([
      { id: 'third', sort_order: 0 },
      { id: 's', sort_order: 1 },
      { id: 'second', sort_order: 2 },
    ]);
    request.flush(null);
    expect(draft.pending()).toBe(false);
  });
  it('ignores unchanged section drops and blocks dragging while the project is locked', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    page('/projects/p/sections', [section, { ...section, id: 'second', sort_order: 1 }]);
    f.componentInstance.toggleOrdering();
    f.componentInstance.drop({ previousIndex: 0, currentIndex: 0 } as CdkDragDrop<
      SectionResponse[]
    >);
    expect(draft.pending()).toBe(false);
    f.componentRef.setInput('locked', true);
    f.componentInstance.drop({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<
      SectionResponse[]
    >);
    expect(draft.pending()).toBe(false);
    expect(f.componentInstance.sections()[0].id).toBe('s');
    http.expectNone((request) => request.method !== 'GET');
  });

  it('activates compact rows and left drag handles only in ordering mode', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    page('/projects/p/sections', [section, { ...section, id: 'second', sort_order: 1 }]);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.section-drag-handle')).toBeNull();
    f.componentInstance.drop({ previousIndex: 0, currentIndex: 1 } as CdkDragDrop<
      SectionResponse[]
    >);
    expect(draft.pending()).toBe(false);
    f.nativeElement.querySelector('.order-sections-toggle').click();
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.section-drag-handle').length).toBe(2);
    expect(f.nativeElement.querySelector('.section-actions')).toBeNull();
    expect(f.nativeElement.querySelector('app-section-preview')).toBeNull();
    expect(f.nativeElement.querySelector('.order-sections-toggle').textContent).toContain(
      'Terminar',
    );
    f.nativeElement.querySelector('.order-sections-toggle').click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.section-drag-handle')).toBeNull();
    expect(f.nativeElement.querySelectorAll('.section-actions').length).toBe(2);
    expect(draft.pending()).toBe(false);
    http.expectNone((request) => request.method !== 'GET');
  });
  it('accepts and re-edits a new characteristic without HTTP writes; saves only the final version', () => {
    attributes();
    let id = '';
    api
      .addAttribute('p', { label: 'Material', value: 'Madera' })
      .subscribe((item) => (id = item.id));
    api.updateAttribute('p', id, { value: 'Hormigón' }).subscribe();
    api.attributes('p').subscribe((p) => expect(p.items[0].value).toBe('Hormigón'));
    http.expectNone(() => true);
    expect(draft.pending()).toBe(true);
    draft.commit().subscribe();
    const write = http.expectOne(base + '/projects/p/attributes');
    expect(write.request.method).toBe('POST');
    expect(write.request.body.value).toBe('Hormigón');
    write.flush({ ...attribute, value: 'Hormigón' });
    expect(draft.pending()).toBe(false);
    api.updateAttribute('p', id, { value: 'Vidrio' }).subscribe();
    draft.commit().subscribe();
    http.expectOne(base + '/projects/p/attributes/a').flush({ ...attribute, value: 'Vidrio' });
  });

  it('removes an accepted new characteristic without creating and deleting it on the backend', () => {
    attributes();
    let id = '';
    api.addAttribute('p', { label: 'Escala', value: '1:100' }).subscribe((item) => (id = item.id));
    api.deleteAttribute('p', id).subscribe();
    draft.commit().subscribe();
    expect(draft.pending()).toBe(false);
    http.expectNone(() => true);
  });

  it('does not create pending writes when an existing characteristic or section is accepted unchanged', () => {
    attributes([attribute]);
    sectionList([section]);
    api.updateAttribute('p', 'a', { label: attribute.label, value: attribute.value }).subscribe();
    sections.update('p', 's', { title: section.title, content: section.content }).subscribe();
    expect(draft.pending()).toBe(false);
    http.expectNone(() => true);
  });

  it('uses actual IDs and performs reordering after all new records have been created', () => {
    attributes();
    let first = '',
      second = '';
    api.addAttribute('p', { label: 'Primero', value: '1' }).subscribe((item) => (first = item.id));
    api.order('p', 'attributes', { items: [{ id: first, sort_order: 0 }] }).subscribe();
    api.addAttribute('p', { label: 'Segundo', value: '2' }).subscribe((item) => (second = item.id));
    api
      .order('p', 'attributes', {
        items: [
          { id: second, sort_order: 0 },
          { id: first, sort_order: 1 },
        ],
      })
      .subscribe();
    draft.commit().subscribe();
    http.expectOne(base + '/projects/p/attributes').flush({ ...attribute, id: 'real-first' });
    http.expectOne(base + '/projects/p/attributes').flush({ ...attribute, id: 'real-second' });
    const order = http.expectOne(base + '/projects/p/attributes/order');
    expect(order.request.body.items).toEqual([
      { id: 'real-second', sort_order: 0 },
      { id: 'real-first', sort_order: 1 },
    ]);
    order.flush(null);
    expect(draft.pending()).toBe(false);
  });

  it('retains failed changes, permits correction and does not repeat successful writes', () => {
    attributes([attribute]);
    sectionList([section]);
    api.updateAttribute('p', 'a', { value: 'Hormigón' }).subscribe();
    sections.update('p', 's', { content: 'Contenido rechazado' }).subscribe();
    draft.commit().subscribe({ error: () => undefined });
    http.expectOne(base + '/projects/p/attributes/a').flush({ ...attribute, value: 'Hormigón' });
    http
      .expectOne(base + '/projects/p/sections/s')
      .flush({ detail: 'Invalid content' }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(draft.pending()).toBe(true);
    expect(draft.saving()).toBe(false);
    expect(draft.failure()).toContain('sección');
    sections.update('p', 's', { content: 'Contenido corregido' }).subscribe();
    draft.commit().subscribe();
    http.expectNone(base + '/projects/p/attributes/a');
    const retry = http.expectOne(base + '/projects/p/sections/s');
    expect(retry.request.body.content).toBe('Contenido corregido');
    retry.flush({ ...section, content: 'Contenido corregido' });
    expect(draft.pending()).toBe(false);
  });

  it('does not start concurrent saves', () => {
    attributes([attribute]);
    api.updateAttribute('p', 'a', { value: 'Hormigón' }).subscribe();
    draft.commit().subscribe();
    let error: unknown;
    draft.commit().subscribe({ error: (value) => (error = value) });
    expect(error).toBeInstanceOf(Error);
    expect(draft.saving()).toBe(true);
    http.expectOne(base + '/projects/p/attributes/a').flush(attribute);
    expect(draft.saving()).toBe(false);
  });

  it('preserves new section content and media through repeated editing and visibility changes', () => {
    sectionList();
    let id = '';
    sections
      .create('p', {
        section_type: 'SPLIT',
        content: 'Texto inicial',
        media: [{ media_id: 'm', caption: 'Patio' }],
      })
      .subscribe((item) => (id = item.id));
    sections.update('p', id, { content: 'Texto final' }).subscribe();
    sections.update('p', id, { is_visible: false }).subscribe();
    sections.media('p', id).subscribe((p) => expect(p.items[0].caption).toBe('Patio'));
    http.expectNone(() => true);
    draft.commit().subscribe();
    const write = http.expectOne(base + '/projects/p/sections');
    expect(write.request.body).toMatchObject({
      content: 'Texto final',
      is_visible: false,
      media: [{ media_id: 'm', caption: 'Patio' }],
    });
    write.flush({ ...section, section_type: 'SPLIT' });
    expect(draft.pending()).toBe(false);
  });

  it('keeps accepted media when an existing section is subsequently hidden', () => {
    sectionList([section]);
    sections
      .update('p', 's', { section_type: 'IMAGE', media: [{ media_id: 'm', caption: 'Vista' }] })
      .subscribe();
    sections.update('p', 's', { is_visible: false }).subscribe();
    draft.commit().subscribe();
    const write = http.expectOne(base + '/projects/p/sections/s');
    expect(write.request.body.media).toEqual([{ media_id: 'm', caption: 'Vista' }]);
    write.flush({ ...section, section_type: 'IMAGE', is_visible: false });
  });

  it('discards a new section and its staged media order without persisting either', () => {
    sectionList();
    let id = '';
    sections
      .create('p', { section_type: 'GALLERY', media: [{ media_id: 'm' }] })
      .subscribe((item) => (id = item.id));
    sections.orderMedia('p', id, { items: [{ id: 'm', sort_order: 0 }] }).subscribe();
    sections.delete('p', id).subscribe();
    draft.commit().subscribe();
    expect(draft.pending()).toBe(false);
    http.expectNone(() => true);
  });

  it('previews only the latest cover and saves it with the existing cover endpoint', () => {
    api.media('p').subscribe();
    page('/projects/p/media');
    api.cover('p', 'm1').subscribe();
    api.cover('p', 'm2').subscribe();
    api.media('p').subscribe((p) => expect(p.items.map((item) => item.media_id)).toEqual(['m2']));
    http.expectNone(() => true);
    draft.commit().subscribe();
    const write = http.expectOne(base + '/projects/p/cover');
    expect(write.request.body).toEqual({ media_id: 'm2' });
    write.flush({
      id: 'cover',
      project_id: 'p',
      media_id: 'm2',
      role: 'COVER',
      created_at: '2026-01-01',
    });
  });

  it('stages metadata but keeps upload authorization on the real media API', () => {
    const media = TestBed.inject(MediaApi);
    media.detail('m').subscribe();
    http.expectOne(base + '/media/m').flush(asset);
    media.update('m', { title: 'Patio' }).subscribe();
    media.update('m', { alt_text: 'Patio de hormigón' }).subscribe();
    media
      .detail('m')
      .subscribe((value) =>
        expect(value).toMatchObject({ title: 'Patio', alt_text: 'Patio de hormigón' }),
      );
    http.expectNone(() => true);
    media
      .presign({ original_filename: 'patio.png', mime_type: 'image/png', file_size: 10 })
      .subscribe();
    http.expectOne(base + '/media/uploads/presign').flush({});
    draft.commit().subscribe();
    const write = http.expectOne(base + '/media/m');
    expect(write.request.body).toMatchObject({ title: 'Patio', alt_text: 'Patio de hormigón' });
    write.flush(asset);
  });

  it('previews and coalesces category assignments', () => {
    api.taxons('categories').subscribe();
    page('/categories', [
      { id: 'c', name: 'Vivienda', slug: 'vivienda', sort_order: 0, created_at: '2026-01-01' },
    ]);
    api.taxons('categories', 0, 'p').subscribe();
    page('/projects/p/categories');
    api.assign('p', 'categories', ['c']).subscribe();
    api.assign('p', 'categories', []).subscribe();
    api.taxons('categories', 0, 'p').subscribe((p) => expect(p.items).toEqual([]));
    http.expectNone(() => true);
    draft.commit().subscribe();
    const write = http.expectOne(base + '/projects/p/categories');
    expect(write.request.body.ids).toEqual([]);
    write.flush(null);
  });

  it('resets pending state and cached previews when changing the project', () => {
    attributes([attribute]);
    api.updateAttribute('p', 'a', { value: 'Vidrio' }).subscribe();
    draft.reset();
    expect(draft.pending()).toBe(false);
    api.attributes('p').subscribe((p) => expect(p.items[0].value).toBe('Piedra'));
    page('/projects/p/attributes', [attribute]);
  });
});

describe('Project modal and final save', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.resetTestingModule();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'p' }) },
            paramMap: new BehaviorSubject(convertToParamMap({ id: 'p' })),
          },
        },
        { provide: AuthService, useValue: { status: () => 'authenticated' } },
        {
          provide: ContentApi,
          useValue: { setting: () => of({ key: 'site_title', value: 'Estudio' }) },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function editor() {
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    f.detectChanges();
    flushRelations();
    f.detectChanges();
    return f;
  }
  function flushRelations() {
    for (const path of [
      '/categories',
      '/tags',
      '/projects/p/categories',
      '/projects/p/tags',
      '/projects/p/attributes',
      '/projects/p/sections',
      '/projects/p/media',
    ]) {
      http
        .match((request) => request.url === base + path)
        .forEach((request) => request.flush({ items: [], total: 0, limit: 100, offset: 0 }));
    }
  }

  it('opens an accessible characteristic modal, previews on accept and writes only on final save', async () => {
    const f = editor();
    const c = f.componentInstance;
    c.tab.set('details');
    expect(f.nativeElement.querySelector('#project-save')).toBeNull();
    const attributes = c.attributes()!;
    attributes.expanded.set(true);
    f.detectChanges();
    const modal = f.nativeElement.querySelector('app-project-edit-modal dialog');
    expect(modal.open).toBe(true);
    expect(modal.getAttribute('aria-labelledby')).toBe('project-edit-modal-title');
    attributes.form.setValue({ label: 'Material', value: 'Hormigón' });
    c.save();
    http.expectNone(() => true);
    attributes.save();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-project-edit-modal')).toBeNull();
    expect(
      f.nativeElement.querySelector('app-project-attributes .relation-row').textContent,
    ).toContain('Hormigón');
    expect(f.nativeElement.querySelector('#project-save')).not.toBeNull();
    expect(c.form.dirty).toBe(false);
    const leaving = c.canLeave();
    expect(c.confirmation()).toBe('leave');
    c.answer(false);
    expect(await leaving).toBe(false);
    c.save();
    const write = http.expectOne(base + '/projects/p/attributes');
    http.expectNone((request) => request.method === 'PATCH');
    write.flush(attribute);
    http.expectOne(base + '/projects/p').flush(project);
    flushRelations();
    f.detectChanges();
    expect(c.draft.pending()).toBe(false);
    expect(f.nativeElement.querySelector('#project-save')).toBeNull();
    expect(c.success()).toBe('Proyecto guardado.');
  });

  it('cancels an unaccepted modal without changing the preview or creating pending writes', () => {
    const f = editor();
    const c = f.componentInstance;
    const attributes = c.attributes()!;
    attributes.expanded.set(true);
    f.detectChanges();
    attributes.form.setValue({ label: 'Material', value: 'Piedra' });
    attributes.form.markAsDirty();
    attributes.cancelEdit();
    attributes.answer(true);
    f.detectChanges();
    expect(attributes.items()).toEqual([]);
    expect(c.draft.pending()).toBe(false);
    expect(f.nativeElement.querySelector('app-project-edit-modal')).toBeNull();
    http.expectNone(() => true);
  });

  it('previews a quote section from the modal without persisting until final save', () => {
    const f = editor();
    const c = f.componentInstance;
    c.tab.set('sections');
    const sections = c.sections()!;
    sections.open(null, 'QUOTE');
    f.detectChanges();
    const sectionEditor = sections.editor()!;
    sectionEditor.form.controls.content.setValue('La luz define el espacio.');
    sectionEditor.save();
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-project-edit-modal')).toBeNull();
    expect(f.nativeElement.querySelector('app-section-preview blockquote').textContent).toContain(
      'La luz define el espacio.',
    );
    expect(c.draft.pending()).toBe(true);
    http.expectNone(() => true);
    c.save();
    http
      .expectOne(base + '/projects/p/sections')
      .flush({ ...section, section_type: 'QUOTE', content: 'La luz define el espacio.' });
    http.expectOne(base + '/projects/p').flush(project);
    flushRelations();
    expect(c.draft.pending()).toBe(false);
  });
});
