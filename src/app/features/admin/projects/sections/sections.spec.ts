import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../../core/api/api-config';
import type { MediaResponse, SectionResponse } from '../../../../core/api/generated/types.gen';
import { ProjectSectionsApi } from './project-sections-api.service';
import { SectionEditor } from './section-editor';
import { ProjectSections } from './project-sections';
import { ProjectMediaPicker } from '../project-media-picker';
import { compatible, SECTION_TYPES } from './section-policy';
import { StlConverter } from '../../media/stl-converter';
import { Subject } from 'rxjs';
import { MediaBrowser } from '../../media/media-browser.service';
const base = 'https://api.test/api/v1/admin/projects/p/sections';
const section: SectionResponse = {
  id: 's',
  project_id: 'p',
  section_type: 'TEXT',
  title: null,
  content: 'Concepto',
  sort_order: 0,
  is_visible: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const asset = (id = 'm', type = 'IMAGE', mime_type = 'image/png') =>
  ({
    id,
    type,
    mime_type,
    original_filename: id + '.png',
    storage_provider: 'external',
    url: 'https://media.test/' + id + '.png',
  }) as MediaResponse;
describe('Section contracts and editor', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const calls: {
    name: string;
    method: string;
    path: string;
    body?: unknown;
    run: (api: ProjectSectionsApi) => Observable<unknown>;
  }[] = [
    { name: 'detail', method: 'GET', path: '/s', run: (a) => a.detail('p', 's') },
    {
      name: 'create',
      method: 'POST',
      path: '',
      body: { section_type: 'TEXT', content: 'Texto' },
      run: (a) => a.create('p', { section_type: 'TEXT', content: 'Texto' }),
    },
    {
      name: 'update nullable fields',
      method: 'PATCH',
      path: '/s',
      body: { title: null, content: 'Nueva cita', section_type: 'QUOTE' },
      run: (a) => a.update('p', 's', { title: null, content: 'Nueva cita', section_type: 'QUOTE' }),
    },
    {
      name: 'visibility',
      method: 'PATCH',
      path: '/s',
      body: { is_visible: false },
      run: (a) => a.update('p', 's', { is_visible: false }),
    },
    { name: 'delete only section', method: 'DELETE', path: '/s', run: (a) => a.delete('p', 's') },
    {
      name: 'order sections',
      method: 'PUT',
      path: '/order',
      body: { items: [{ id: 's', sort_order: 0 }] },
      run: (a) => a.order('p', { items: [{ id: 's', sort_order: 0 }] }),
    },
    {
      name: 'attach section media',
      method: 'POST',
      path: '/s/media',
      body: { media_id: 'm', caption: 'Plano' },
      run: (a) => a.attach('p', 's', { media_id: 'm', caption: 'Plano' }),
    },
    {
      name: 'caption',
      method: 'PATCH',
      path: '/s/media/m',
      body: { caption: null, sort_order: 2 },
      run: (a) => a.updateMedia('p', 's', 'm', { caption: null, sort_order: 2 }),
    },
    {
      name: 'detach only relation',
      method: 'DELETE',
      path: '/s/media/m',
      run: (a) => a.detach('p', 's', 'm'),
    },
    {
      name: 'order by media UUID',
      method: 'PUT',
      path: '/s/media/order',
      body: { items: [{ id: 'm', sort_order: 0 }] },
      run: (a) => a.orderMedia('p', 's', { items: [{ id: 'm', sort_order: 0 }] }),
    },
  ];
  for (const c of calls)
    it(c.name, () => {
      c.run(TestBed.inject(ProjectSectionsApi)).subscribe();
      const req = http.expectOne(base + c.path);
      expect(req.request.method).toBe(c.method);
      if (c.body) expect(req.request.body).toEqual(c.body);
      req.flush(c.method === 'DELETE' || c.method === 'PUT' ? null : section);
    });
  for (const media of [false, true])
    it('paginates ' + (media ? 'media' : 'sections'), () => {
      const api = TestBed.inject(ProjectSectionsApi);
      const request: Observable<unknown> = media ? api.media('p', 's', 100) : api.list('p', 100);
      request.subscribe();
      const req = http.expectOne((r) => r.url === base + (media ? '/s/media' : ''));
      expect(req.request.params.get('offset')).toBe('100');
      expect(req.request.params.get('limit')).toBe('100');
      req.flush({ items: [], total: 100, offset: 100, limit: 100 });
    });
  function editor(type: typeof section.section_type = 'TEXT') {
    const fixture = TestBed.createComponent(SectionEditor);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.componentRef.setInput('type', type);
    fixture.detectChanges();
    return fixture;
  }
  function fileDrag(type: string, files: File[] = []) {
    const event = new Event(type, { cancelable: true, bubbles: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], files, dropEffect: 'none' },
    });
    return event as DragEvent;
  }
  it('highlights gallery uploads on nested drag enter and resets on leave or drop', () => {
    const fixture = editor('GALLERY');
    const e = fixture.componentInstance;
    expect(fixture.nativeElement.querySelector('.upload-dropzone')).not.toBeNull();
    e.galleryDragEnter(fileDrag('dragenter'));
    e.galleryDragEnter(fileDrag('dragenter'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.upload-dropzone.drag-active')).not.toBeNull();
    e.galleryDragLeave(fileDrag('dragleave'));
    expect(e.draggingFiles()).toBe(true);
    e.galleryDragLeave(fileDrag('dragleave'));
    expect(e.draggingFiles()).toBe(false);
    const start = vi.spyOn(e.upload, 'start').mockImplementation(() => undefined);
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    e.galleryDragEnter(fileDrag('dragenter'));
    const drop = fileDrag('drop', [file]);
    e.dropGalleryFile(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(e.draggingFiles()).toBe(false);
    expect(e.upload.file()).toBe(file);
    expect(start).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });
  it('rejects invalid or multiple gallery drops without starting an upload', () => {
    const e = editor('GALLERY').componentInstance;
    const start = vi.spyOn(e.upload, 'start');
    e.dropGalleryFile(fileDrag('drop', [new File(['x'], 'file.obj')]));
    expect(e.error()).toContain('Formato');
    e.dropGalleryFile(fileDrag('drop', [new File(['x'], 'a.png'), new File(['x'], 'b.png')]));
    expect(e.error()).toContain('una imagen a la vez');
    expect(start).not.toHaveBeenCalled();
    http.expectNone(() => true);
  });
  it('ignores gallery drops while uploading or locked and keeps other section types unchanged', () => {
    const fixture = editor('GALLERY');
    const e = fixture.componentInstance;
    const file = new File(['x'], 'a.png');
    const start = vi.spyOn(e.upload, 'start');
    e.upload.stage.set('uploading');
    e.galleryDragEnter(fileDrag('dragenter'));
    e.dropGalleryFile(fileDrag('drop', [file]));
    expect(e.draggingFiles()).toBe(false);
    expect(start).not.toHaveBeenCalled();
    e.upload.stage.set('selected');
    fixture.componentRef.setInput('locked', true);
    e.dropGalleryFile(fileDrag('drop', [file]));
    expect(start).not.toHaveBeenCalled();
    http.expectNone(() => true);
    const model = editor('MODEL_3D');
    expect(model.nativeElement.querySelector('.upload-dropzone')).toBeNull();
  });
  it('automatically previews existing gallery photographs without a view-image button', () => {
    const browser = TestBed.inject(MediaBrowser);
    const create = vi.spyOn(browser, 'create').mockReturnValue('blob:gallery-preview');
    const revoke = vi.spyOn(browser, 'revoke').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(SectionEditor);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.componentRef.setInput('section', { ...section, section_type: 'GALLERY' });
    fixture.detectChanges();
    http.expectOne(base + '/s').flush({ ...section, section_type: 'GALLERY' });
    http
      .expectOne((r) => r.url === base + '/s/media')
      .flush({ items: [{ media_id: 'photo', sort_order: 0 }], total: 1, limit: 100, offset: 0 });
    http
      .expectOne('https://api.test/api/v1/admin/media/photo')
      .flush({ ...asset('photo'), storage_provider: 'r2' });
    fixture.detectChanges();
    http
      .expectOne('https://api.test/api/v1/admin/media/photo/content')
      .flush(new Blob(['png'], { type: 'image/png' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.section-media img').getAttribute('src')).toBe(
      'blob:gallery-preview',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Ver imagen');
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:gallery-preview');
    create.mockRestore();
    revoke.mockRestore();
  });
  it('offers text, image gallery and architectural models when creating sections', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http
      .expectOne((request) => request.url === base)
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    const options = Array.from(
      f.nativeElement.querySelectorAll('select option') as NodeListOf<HTMLOptionElement>,
    );
    expect(options.map((option) => option.value)).toEqual(['TEXT', 'GALLERY', 'MODEL_3D']);
    const e = editor();
    const editorOptions = Array.from(
      e.nativeElement.querySelectorAll(
        'select[formControlName="section_type"] option',
      ) as NodeListOf<HTMLOptionElement>,
    );
    expect(editorOptions.map((option) => option.value)).toEqual(['TEXT', 'GALLERY', 'MODEL_3D']);
  });
  it('preserves the current type when editing an existing legacy section', () => {
    const f = TestBed.createComponent(SectionEditor);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('section', { ...section, section_type: 'QUOTE' });
    f.detectChanges();
    http.expectOne(base + '/s').flush({ ...section, section_type: 'QUOTE' });
    http
      .expectOne((request) => request.url === base + '/s/media')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    f.detectChanges();
    expect(f.componentInstance.form.controls.section_type.value).toBe('QUOTE');
    const options = Array.from(
      f.nativeElement.querySelectorAll(
        'select[formControlName="section_type"] option',
      ) as NodeListOf<HTMLOptionElement>,
    );
    expect(options.map((option) => option.value)).toEqual(['QUOTE', 'TEXT', 'GALLERY', 'MODEL_3D']);
  });
  it.each([false, true])(
    'preserves existing visibility %s while editing without a visibility checkbox',
    (visible) => {
      const fixture = TestBed.createComponent(SectionEditor);
      fixture.componentRef.setInput('projectId', 'p');
      fixture.componentRef.setInput('section', { ...section, is_visible: visible });
      fixture.detectChanges();
      http.expectOne(base + '/s').flush({ ...section, is_visible: visible });
      http
        .expectOne((r) => r.url === base + '/s/media')
        .flush({ items: [], total: 0, limit: 100, offset: 0 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('input[formControlName=is_visible]')).toBeNull();
      fixture.componentInstance.form.controls.title.setValue('Título editado');
      fixture.componentInstance.save();
      const request = http.expectOne(base + '/s');
      expect(request.request.body.is_visible).toBe(visible);
      request.flush({ ...section, title: 'Título editado', is_visible: visible });
    },
  );

  it('only adds a confirmed inline upload once and requires saving its section relation', () => {
    const f = editor('IMAGE');
    const e = f.componentInstance;
    e.upload.asset.set(asset('inline'));
    e.upload.stage.set('uploading');
    f.detectChanges();
    expect(e.form.controls.media.length).toBe(0);
    e.upload.stage.set('completed');
    f.detectChanges();
    expect(e.body().media?.map((m) => m.media_id)).toEqual(['inline']);
    expect(e.hasChanges()).toBe(true);
    http.expectNone(() => true);
    f.detectChanges();
    expect(e.form.controls.media.length).toBe(1);
    e.save();
    const request = http.expectOne(base);
    expect(request.request.body.media[0].media_id).toBe('inline');
    request.flush({ ...section, section_type: 'IMAGE' });
    expect(e.hasChanges()).toBe(false);
  });
  it('adds a confirmed gallery upload to this project photographs before accepting the section', () => {
    const f = editor('GALLERY');
    const e = f.componentInstance;
    e.upload.asset.set(asset('uploaded'));
    e.upload.stage.set('completed');
    f.detectChanges();
    http.expectNone(() => true);
    e.save();
    http
      .expectOne(
        (r) => r.url === 'https://api.test/api/v1/admin/projects/p/media' && r.method === 'GET',
      )
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    const attach = http.expectOne('https://api.test/api/v1/admin/projects/p/media');
    expect(attach.request.method).toBe('POST');
    expect(attach.request.body).toEqual({ media_id: 'uploaded', role: 'GALLERY', sort_order: 0 });
    attach.flush({ id: 'link', media_id: 'uploaded', role: 'GALLERY' });
    const create = http.expectOne(base);
    expect(create.request.body.media[0].media_id).toBe('uploaded');
    create.flush({ ...section, section_type: 'GALLERY' });
  });
  it('limits the gallery picker to photographs of the current project without querying the global library', () => {
    const f = TestBed.createComponent(ProjectMediaPicker);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('mediaType', 'IMAGE');
    f.componentInstance.load(0);
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/media')
      .flush({
        items: [
          { media_id: 'own', role: 'GALLERY' },
          { media_id: 'own', role: 'GALLERY' },
          { media_id: 'cover', role: 'COVER' },
        ],
        total: 3,
        limit: 100,
        offset: 0,
      });
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/sections')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    http.expectOne('https://api.test/api/v1/admin/media/own').flush(asset('own'));
    expect(f.componentInstance.page()?.items.map((item) => item.id)).toEqual(['own']);
    http.expectNone((r) => r.url === 'https://api.test/api/v1/admin/media');
  });
  it('blocks section saving during inline upload and keeps errors visible without an association', () => {
    const f = editor('GALLERY');
    const e = f.componentInstance;
    e.upload.stage.set('uploading');
    e.save();
    http.expectNone(() => true);
    expect(e.hasChanges()).toBe(true);
    e.upload.file.set(new File(['image'], 'test.png', { type: 'image/png' }));
    e.upload.stage.set('failed');
    e.upload.error.set('No se pudo confirmar el archivo.');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No se pudo confirmar el archivo.');
    expect(e.form.controls.media.length).toBe(0);
  });
  it('rejects incompatible inline files before requesting upload authorization', () => {
    const f = editor('MODEL_3D');
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [new File(['image'], 'test.png', { type: 'image/png' })],
    });
    f.componentInstance.selectFile({ target: input } as unknown as Event);
    expect(f.componentInstance.error()).toContain('compatible');
    http.expectNone(() => true);
  });
  it('offers only inline upload for MODEL_3D and never opens the library picker', () => {
    const fixture = editor('MODEL_3D');
    expect(fixture.nativeElement.querySelector('#section-upload-file').accept).toBe('.glb,.stl');
    expect(fixture.nativeElement.textContent).not.toContain('Elegir de biblioteca');
    fixture.componentInstance.picker.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-project-media-picker')).toBeNull();
    http.expectNone(() => true);
  });
  it('accepts STL only in MODEL_3D and blocks saving until conversion finishes', () => {
    const conversion = new Subject<never>();
    const converter = vi.spyOn(TestBed.inject(StlConverter), 'convert').mockReturnValue(conversion);
    const f = editor('MODEL_3D');
    expect(f.componentInstance.uploadAccept()).toContain('.stl');
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['solid'], 'building.stl')] });
    f.componentInstance.selectFile({ target: input } as unknown as Event);
    expect(converter).toHaveBeenCalledOnce();
    expect(f.componentInstance.upload.stage()).toBe('converting');
    f.componentInstance.save();
    http.expectNone(() => true);
    f.componentInstance.upload.cancel();
    expect(conversion.observed).toBe(false);
  });
  it('opens a fresh file picker after a local read failure', () => {
    const fixture = editor('MODEL_3D');
    const upload = fixture.componentInstance.upload;
    upload.file.set(new File(['solid'], 'building.stl'));
    upload.stage.set('failed');
    upload.requiresFileSelection.set(true);
    fixture.detectChanges();
    const picker = fixture.nativeElement.querySelector('#section-upload-file') as HTMLInputElement;
    const click = vi.spyOn(picker, 'click').mockImplementation(() => undefined);
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Volver a seleccionar archivo'));
    expect(button).toBeDefined();
    button!.click();
    expect(click).toHaveBeenCalledOnce();
    http.expectNone(() => true);
  });

  for (const type of SECTION_TYPES)
    it('creates ' + type + ' with only real fields', () => {
      const f = editor(type);
      const e = f.componentInstance;
      e.form.controls.content.setValue('Contenido');
      if (['IMAGE', 'GALLERY', 'SPLIT'].includes(type)) e.select(asset());
      if (type === 'VIDEO') e.select(asset('v', 'VIDEO', 'video/mp4'));
      if (type === 'MODEL_3D') e.select(asset('g', 'MODEL_3D', 'model/gltf-binary'));
      e.save();
      const req = http.expectOne(base);
      expect(req.request.body.section_type).toBe(type);
      expect(req.request.body.is_visible).toBe(true);
      expect(req.request.body).not.toHaveProperty('alignment');
      req.flush({ ...section, section_type: type });
      expect(e.hasChanges()).toBe(false);
    });
  it('requires content and avoids duplicate submits', () => {
    const f = editor();
    const e = f.componentInstance;
    e.save();
    http.expectNone(base);
    e.form.controls.content.setValue('Texto');
    e.save();
    e.save();
    const req = http.expectOne(base);
    req.flush(section);
  });
  it('rejects incompatible video and GLTF assets', () => {
    const e = editor('MODEL_3D').componentInstance;
    e.select(asset('g', 'MODEL_3D', 'model/gltf+json'));
    expect(e.form.controls.media.length).toBe(0);
    expect(compatible('VIDEO', asset())).toBe(false);
  });
  it('gallery permits distinct assets, local reorder and relation removal without HTTP', () => {
    const e = editor('GALLERY').componentInstance;
    e.select(asset('a'));
    e.select(asset('b'));
    e.select(asset('b'));
    expect(e.form.controls.media.length).toBe(2);
    e.move(1, -1);
    expect(e.body().media?.[0].media_id).toBe('b');
    e.remove(0);
    expect(e.body().media?.[0].media_id).toBe('a');
    http.expectNone((r) => r.method !== 'GET');
  });
  for (const status of [0, 409, 422])
    it('preserves input after error ' + status, () => {
      const e = editor().componentInstance;
      e.form.controls.content.setValue('No perder');
      e.form.markAsDirty();
      e.save();
      const req = http.expectOne(base);
      if (status === 0) req.error(new ProgressEvent('error'));
      else
        req.flush(
          {
            detail:
              status === 422
                ? [{ loc: ['body', 'content'], msg: 'Invalid', type: 'value_error' }]
                : 'Conflict',
          },
          { status, statusText: 'Error' },
        );
      expect(e.form.controls.content.value).toBe('No perder');
      expect(e.busy()).toBe(false);
      expect(e.error()).toBeTruthy();
      if (status === 422) expect(e.form.controls.content.hasError('backend')).toBe(true);
    });
  it('loads existing section and persists gallery final order by media_id', () => {
    const f = TestBed.createComponent(SectionEditor);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('section', { ...section, section_type: 'GALLERY', content: null });
    f.detectChanges();
    http.expectOne(base + '/s').flush({ ...section, section_type: 'GALLERY', content: null });
    http
      .expectOne((r) => r.url === base + '/s/media')
      .flush({
        items: [
          { media_id: 'a', section_id: 's', sort_order: 0, caption: null },
          { media_id: 'b', section_id: 's', sort_order: 1, caption: null },
        ],
        total: 2,
        limit: 100,
        offset: 0,
      });
    http.expectOne('https://api.test/api/v1/admin/media/a').flush(asset('a'));
    http.expectOne('https://api.test/api/v1/admin/media/b').flush(asset('b'));
    const e = f.componentInstance;
    expect(e.hasChanges()).toBe(false);
    e.move(1, -1);
    http.expectNone((r) => r.method === 'PUT');
    e.save();
    const req = http.expectOne(base + '/s/media/order');
    expect(req.request.body).toEqual({
      items: [
        { id: 'b', sort_order: 0 },
        { id: 'a', sort_order: 1 },
      ],
    });
    req.flush(null);
  });
  it('shows empty state and reloads authoritative order on failure', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, limit: 100, offset: 0 });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Aún no has organizado la presentación');
    f.componentInstance.sections.set([section, { ...section, id: 'second', sort_order: 1 }]);
    f.componentInstance.move(1, -1);
    http
      .expectOne(base + '/order')
      .flush({ detail: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    http
      .expectOne((r) => r.url === base)
      .flush({
        items: [section, { ...section, id: 'second', sort_order: 1 }],
        total: 2,
        limit: 100,
        offset: 0,
      });
    expect(f.componentInstance.sections()[0].id).toBe('s');
    expect(f.componentInstance.error()).toBeTruthy();
  });
  it('does not overwrite an existing section after a failed initial load', () => {
    const f = TestBed.createComponent(SectionEditor);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('section', section);
    f.detectChanges();
    http
      .expectOne(base + '/s')
      .flush({ detail: 'Not found' }, { status: 404, statusText: 'Not found' });
    // forkJoin cancels the parallel media load when detail fails.
    http.expectOne((r) => r.url === base + '/s/media');
    f.componentInstance.form.controls.content.setValue('Not an overwrite');
    f.componentInstance.save();
    http.expectNone((r) => r.method === 'PATCH');
    expect(f.componentInstance.loaded()).toBe(false);
  });
  it('hidden incomplete sections can be saved without pretending they are publishable', () => {
    const e = editor('IMAGE').componentInstance;
    e.form.patchValue({ title: 'Preparación', is_visible: false });
    e.save();
    const req = http.expectOne(base);
    expect(req.request.body.media).toEqual([]);
    expect(req.request.body.is_visible).toBe(false);
    req.flush({ ...section, section_type: 'IMAGE', is_visible: false });
  });
  it('retains existing ID and allows a valid type change', () => {
    const f = TestBed.createComponent(SectionEditor);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('section', section);
    f.detectChanges();
    http.expectOne(base + '/s').flush(section);
    http
      .expectOne((r) => r.url === base + '/s/media')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    expect(f.componentInstance.hasChanges()).toBe(false);
    f.componentInstance.form.controls.section_type.setValue('QUOTE');
    f.componentInstance.save();
    const req = http.expectOne(base + '/s');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body.section_type).toBe('QUOTE');
    expect(req.request.body.content).toBe('Concepto');
    req.flush({ ...section, section_type: 'QUOTE' });
  });
  it('loads all section pages without truncation', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http
      .expectOne((r) => r.url === base && r.params.get('offset') === '0')
      .flush({ items: [section], total: 2, limit: 1, offset: 0 });
    http
      .expectOne((r) => r.url === base && r.params.get('offset') === '1')
      .flush({ items: [{ ...section, id: 'next' }], total: 2, limit: 1, offset: 1 });
    expect(f.componentInstance.sections().length).toBe(2);
  });
  it('cancels a pristine section editor without a write', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, limit: 100, offset: 0 });
    f.componentInstance.open(null, 'TEXT');
    f.detectChanges();
    expect(f.componentInstance.editing()).not.toBeNull();
    f.componentInstance.cancel();
    expect(f.componentInstance.editing()).toBeNull();
    http.expectNone((r) => r.method !== 'GET');
  });
  it('asks before discarding a dirty section and retains it on cancellation', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, limit: 100, offset: 0 });
    f.componentInstance.open(null, 'TEXT');
    f.detectChanges();
    f.componentInstance.editor()!.form.markAsDirty();
    f.componentInstance.cancel();
    expect(f.componentInstance.confirmation()?.kind).toBe('discard');
    f.componentInstance.answer(false);
    expect(f.componentInstance.hasChanges()).toBe(true);
    f.componentInstance.cancel();
    f.componentInstance.answer(true);
    expect(f.componentInstance.editing()).toBeNull();
  });
  it('single-image types reject a second asset without replacing existing relations', () => {
    const e = editor('IMAGE').componentInstance;
    e.select(asset('a'));
    e.select(asset('b'));
    expect(e.body().media?.map((m) => m.media_id)).toEqual(['a']);
    expect(e.error()).toContain('reemplazo');
  });
  it('reuses the existing picker and fixes backend filtering to the section media type', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    const f = TestBed.createComponent(ProjectMediaPicker);
    f.componentRef.setInput('mediaType', 'IMAGE');
    f.detectChanges();
    const req = http.expectOne((r) => r.url === 'https://api.test/api/v1/admin/media');
    expect(req.request.params.get('type')).toBe('IMAGE');
    req.flush({ items: [], total: 0, limit: 12, offset: 0 });
    f.componentInstance.filters.controls.type.setValue('VIDEO');
    f.componentInstance.load(0);
    const again = http.expectOne((r) => r.url === 'https://api.test/api/v1/admin/media');
    expect(again.request.params.get('type')).toBe('IMAGE');
    again.flush({ items: [], total: 0, limit: 12, offset: 0 });
    http.expectNone((r) => r.method === 'PUT');
  });
  it('uses bounded sequential batches for a large section order', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, limit: 100, offset: 0 });
    const sections = Array.from({ length: 101 }, (_, i) => ({
      ...section,
      id: 's' + i,
      sort_order: i,
    }));
    f.componentInstance.sections.set(sections);
    f.componentInstance.move(0, 1);
    const first = http.expectOne(base + '/order');
    expect(first.request.body.items.length).toBe(100);
    expect(first.request.body.items[0]).toEqual({ id: 's1', sort_order: 0 });
    http.expectNone((r) => r.url === base);
    first.flush(null);
    const second = http.expectOne(base + '/order');
    expect(second.request.body.items).toEqual([{ id: 's100', sort_order: 100 }]);
    second.flush(null);
    http.expectOne((r) => r.url === base).flush({ items: [], total: 0, limit: 100, offset: 0 });
  });
  it('reloads authoritative gallery order after a failed media reorder without retrying the write', () => {
    const f = TestBed.createComponent(SectionEditor);
    f.componentRef.setInput('projectId', 'p');
    f.componentRef.setInput('section', { ...section, section_type: 'GALLERY', content: null });
    f.detectChanges();
    const load = () => {
      http.expectOne(base + '/s').flush({ ...section, section_type: 'GALLERY', content: null });
      http
        .expectOne((r) => r.url === base + '/s/media')
        .flush({
          items: [
            { media_id: 'a', section_id: 's', sort_order: 0, caption: null },
            { media_id: 'b', section_id: 's', sort_order: 1, caption: null },
          ],
          total: 2,
          limit: 100,
          offset: 0,
        });
      http.expectOne('https://api.test/api/v1/admin/media/a').flush(asset('a'));
      http.expectOne('https://api.test/api/v1/admin/media/b').flush(asset('b'));
    };
    load();
    const e = f.componentInstance;
    e.move(1, -1);
    e.save();
    http
      .expectOne(base + '/s/media/order')
      .flush({ detail: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    load();
    expect(e.body().media?.[0].media_id).toBe('a');
    expect(e.hasChanges()).toBe(false);
    expect(e.error()).toBeTruthy();
    http.expectNone((r) => r.method === 'PUT');
  });
  it('deletion conflict preserves the authoritative list and never deletes a global asset', () => {
    const f = TestBed.createComponent(ProjectSections);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    const page = { items: [section], total: 1, limit: 100, offset: 0 };
    http.expectOne((r) => r.url === base).flush(page);
    f.componentInstance.remove(section);
    expect(f.componentInstance.confirmation()?.kind).toBe('delete');
    http.expectNone((r) => r.method === 'DELETE');
    f.componentInstance.answer(true);
    http
      .expectOne(base + '/s')
      .flush({ detail: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    http.expectOne((r) => r.url === base).flush(page);
    expect(f.componentInstance.sections()).toEqual([section]);
    expect(f.componentInstance.error()).toContain('conflicto');
    http.expectNone((r) => r.url.includes('/admin/media'));
  });
});
