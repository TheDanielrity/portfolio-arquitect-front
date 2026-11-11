import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { ContentApi } from '../content/content-api.service';
import { API_BASE_URL } from '../../../core/api/api-config';
import { AuthService } from '../../../core/auth/auth.service';
import { ProjectEditor } from './project-editor';
import { ProjectList } from './project-list';
import { TaxonomyPage } from '../taxonomy/taxonomy-page';
import { ProjectTaxonomy } from './project-taxonomy';
import { ProjectAttributes } from './project-attributes';
import { ProjectMedia } from './project-media';
import { ProjectMediaPicker } from './project-media-picker';
import type { MediaResponse, ProjectResponse } from '../../../core/api/generated/types.gen';
const base = 'https://api.test/api/v1/admin';
const project: ProjectResponse = {
  id: 'p',
  title: 'Casa',
  slug: 'casa',
  status: 'DRAFT',
  visibility: 'PRIVATE',
  published_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const asset: MediaResponse = {
  id: 'm',
  type: 'IMAGE',
  original_filename: 'plan.png',
  storage_provider: 'r2',
  storage_key: 'secret',
  url: 'https://r2.test/secret',
  thumbnail_url: null,
  mime_type: 'image/png',
  file_size: 70,
  width: 1,
  height: 1,
  title: null,
  alt_text: null,
  description: null,
  metadata: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
describe('Project workflows', () => {
  let http: HttpTestingController;
  let route: {
    snapshot: { paramMap: ReturnType<typeof convertToParamMap> };
    paramMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
    queryParamMap: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  };
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    route = {
      snapshot: { paramMap: convertToParamMap({}) },
      paramMap: new BehaviorSubject(convertToParamMap({})),
      queryParamMap: new BehaviorSubject(convertToParamMap({})),
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ContentApi,
          useValue: {
            setting: () => of({ value: 'Estudio', key: 'site_title', updated_at: 'now' }),
          },
        },
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: ActivatedRoute, useValue: route },
        { provide: AuthService, useValue: { status: () => 'authenticated' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  function flush(
    path: string,
    items: unknown[] = [],
    total = items.length,
    offset = 0,
    limit = 100,
  ) {
    http.expectOne((r) => r.url === base + path).flush({ items, total, offset, limit });
  }
  function list() {
    const f = TestBed.createComponent(ProjectList);
    f.detectChanges();
    flush('/categories');
    flush('/tags');
    return f;
  }
  it('list loading, empty and no fictitious data', () => {
    const f = list();
    expect(f.componentInstance.state()).toBe('loading');
    flush('/projects', [], 0, 0, 20);
    f.detectChanges();
    expect(f.componentInstance.state()).toBe('empty');
    expect(f.nativeElement.textContent).toContain('No hay proyectos');
    expect(f.nativeElement.querySelector('.page-heading a')?.textContent).toContain(
      'Crear proyecto',
    );
  });
  it('selects a homepage project once and reloads authoritative featured state', () => {
    const f = list();
    const e = f.componentInstance;
    e.view.set('list');
    const previous: ProjectResponse = {
      ...project,
      id: 'previous',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      is_featured: true,
    };
    const next: ProjectResponse = {
      ...project,
      id: 'next',
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      is_featured: false,
    };
    flush('/projects', [previous, next], 2, 0, 20);
    f.detectChanges();
    const stars = f.nativeElement.querySelectorAll(
      '.featured-toggle',
    ) as NodeListOf<HTMLButtonElement>;
    expect(stars[0].getAttribute('aria-pressed')).toBe('true');
    expect(stars[1].getAttribute('aria-label')).toContain('Destacar en portada');
    expect(stars[1].textContent?.trim()).toBe('');
    stars[1].click();
    e.feature(next);
    e.move(1, 0);
    const request = http.expectOne(base + '/projects/next');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ is_featured: true });
    expect(e.featuring()).toBe('next');
    expect(e.canReorder()).toBe(false);
    request.flush({ ...next, is_featured: true });
    flush(
      '/projects',
      [
        { ...previous, is_featured: false },
        { ...next, is_featured: true },
      ],
      2,
      0,
      20,
    );
    f.detectChanges();
    expect(stars[0].getAttribute('aria-pressed')).toBe('false');
    expect(stars[1].getAttribute('aria-pressed')).toBe('true');
    expect(e.featuredNotice()).toContain('guardado');
    expect(e.featuring()).toBeNull();
  });
  it('keeps the authoritative selection after a failed feature request and allows retry', () => {
    const e = list().componentInstance;
    const next: ProjectResponse = { ...project, status: 'PUBLISHED', visibility: 'PUBLIC' };
    flush('/projects', [next], 1, 0, 20);
    e.feature(next);
    http
      .expectOne(base + '/projects/p')
      .flush({ detail: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    expect(e.featuredError()).toBeTruthy();
    expect(e.featuredNotice()).toBe('');
    flush('/projects', [next], 1, 0, 20);
    expect(e.page()?.items[0].is_featured).toBeFalsy();
    e.feature(next);
    http.expectOne(base + '/projects/p').flush({ ...next, is_featured: true });
    flush('/projects', [{ ...next, is_featured: true }], 1, 0, 20);
  });
  it('does not feature drafts, private projects or the existing selection', () => {
    const f = list();
    f.componentInstance.view.set('list');
    flush('/projects', [project], 1, 0, 20);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.featured-toggle').disabled).toBe(true);
    f.componentInstance.feature(project);
    f.componentInstance.feature({ ...project, status: 'PUBLISHED', visibility: 'PRIVATE' });
    f.componentInstance.feature({
      ...project,
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      is_featured: true,
    });
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('saves the final card order and blocks repeated moves while saving', () => {
    const e = list().componentInstance;
    const second = { ...project, id: 'second', title: 'Patio' };
    flush('/projects', [project, second], 2, 0, 20);
    e.move(1, 0);
    e.move(1, 0);
    const request = http.expectOne(base + '/projects/order');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({
      items: [
        { id: 'second', sort_order: 0 },
        { id: 'p', sort_order: 1 },
      ],
    });
    request.flush(null);
    flush('/projects', [second, project], 2, 0, 20);
    expect(e.page()?.items[0].id).toBe('second');
    expect(e.reorderNotice()).toContain('guardado');
  });
  it('disables portfolio reordering when the list is filtered', () => {
    route.queryParamMap.next(convertToParamMap({ status: 'DRAFT' }));
    const e = list().componentInstance;
    flush('/projects', [project, { ...project, id: 'second' }], 2, 0, 20);
    e.move(1, 0);
    expect(e.canReorder()).toBe(false);
    http.expectNone((r) => r.method === 'PUT');
  });
  it('reloads the saved order after a reorder failure', () => {
    const e = list().componentInstance;
    const second = { ...project, id: 'second' };
    flush('/projects', [project, second], 2, 0, 20);
    e.move(1, 0);
    http
      .expectOne(base + '/projects/order')
      .flush({ detail: 'Failure' }, { status: 500, statusText: 'Error' });
    flush('/projects', [project, second], 2, 0, 20);
    expect(e.page()?.items[0].id).toBe('p');
    expect(e.reorderError()).toBeTruthy();
    expect(e.reordering()).toBe(false);
  });
  it('preserves projects on other pages when reordering the visible page', () => {
    const e = list().componentInstance;
    const second = { ...project, id: 'second' };
    const third = { ...project, id: 'third' };
    flush('/projects', [project, second], 3, 0, 2);
    e.move(1, 0);
    const collection = http.expectOne((r) => r.url === base + '/projects');
    expect(collection.request.params.get('limit')).toBe('100');
    collection.flush({ items: [project, second, third], total: 3, offset: 0, limit: 100 });
    const request = http.expectOne(base + '/projects/order');
    expect(request.request.body.items).toEqual([
      { id: 'second', sort_order: 0 },
      { id: 'p', sort_order: 1 },
      { id: 'third', sort_order: 2 },
    ]);
    request.flush(null);
    flush('/projects', [second, project], 3, 0, 2);
  });
  it('renders loaded projects and edit navigation', () => {
    const f = list();
    flush('/projects', [project], 1, 0, 20);
    f.detectChanges();
    expect(f.componentInstance.state()).toBe('loaded');
    flush('/projects/p/media');
    expect(f.nativeElement.textContent).toContain('Casa');
    expect(f.nativeElement.querySelector('.project-edit-link')?.textContent).toContain('Casa');
    expect(f.nativeElement.querySelector('.project-row .button')).toBeNull();
  });
  it('list failure keeps context and can refresh', () => {
    const f = list();
    http.expectOne((r) => r.url === base + '/projects').error(new ProgressEvent('error'));
    expect(f.componentInstance.state()).toBe('error');
    f.componentInstance.refresh();
    flush('/projects', [], 0, 0, 20);
    expect(f.componentInstance.state()).toBe('empty');
  });
  it('reads URL filters, pagination and browser navigation updates', () => {
    route.queryParamMap.next(
      convertToParamMap({
        q: ' casa ',
        status: 'DRAFT',
        visibility: 'PRIVATE',
        offset: '20',
        is_featured: 'false',
      }),
    );
    const f = list();
    const r = http.expectOne((r) => r.url === base + '/projects');
    expect(r.request.params.get('q')).toBe('casa');
    expect(r.request.params.get('is_featured')).toBe('false');
    r.flush({ items: [project], total: 50, offset: 20, limit: 20 });
    f.componentInstance.paginate(1);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: expect.objectContaining({ offset: 40 }),
    });
    route.queryParamMap.next(convertToParamMap({ status: 'PUBLISHED', offset: '0' }));
    http
      .expectOne((r) => r.params.get('status') === 'PUBLISHED')
      .flush({ items: [], total: 0, offset: 0, limit: 20 });
  });
  it('rejects invalid URL enums/offsets and submits trimmed server search', () => {
    route.queryParamMap.next(convertToParamMap({ offset: '-1', status: 'UNKNOWN' }));
    const f = list();
    const r = http.expectOne((r) => r.url === base + '/projects');
    expect(r.request.params.get('offset')).toBe('0');
    expect(r.request.params.has('status')).toBe(false);
    r.flush({ items: [], total: 0, offset: 0, limit: 20 });
    f.componentInstance.filters.controls.q.setValue(' casa ');
    f.componentInstance.apply();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: expect.objectContaining({ q: 'casa', offset: 0 }),
    });
  });
  it('clamps an out-of-range page after deletion', () => {
    route.queryParamMap.next(convertToParamMap({ offset: '40' }));
    list();
    flush('/projects', [], 23, 40, 20);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith([], {
      relativeTo: route,
      queryParams: expect.objectContaining({ offset: 20 }),
    });
  });
  function editor() {
    const f = TestBed.createComponent(ProjectEditor);
    f.detectChanges();
    return f;
  }

  it('generates SEO for creation, updates preview and saves the generated values', () => {
    const f = editor();
    const c = f.componentInstance;
    c.form.patchValue({
      title: 'Casa Patio',
      short_description: ' Un patio luminoso. ',
      description: 'Descripción completa',
    });
    expect(c.customSeo()).toBe(false);
    expect(c.body()).toMatchObject({
      seo_title: 'Casa Patio | Estudio',
      seo_description: 'Un patio luminoso.',
    });
    c.form.controls.short_description.setValue('  ');
    expect(c.body().seo_description).toBe('Descripción completa');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.seo-preview').textContent).toContain(
      'Casa Patio | Estudio',
    );
    expect(f.nativeElement.querySelector('[formControlName="seo_title"]').readOnly).toBe(true);
    c.save();
    const request = http.expectOne(base + '/projects');
    expect(request.request.body.seo_title).toBe('Casa Patio | Estudio');
    request.flush({
      ...project,
      title: 'Casa Patio',
      seo_title: 'Casa Patio | Estudio',
      seo_description: 'Descripción completa',
    });
    expect(c.customSeo()).toBe(false);
  });
  it('protects customized SEO and explicitly replaces it when returning to automatic mode', () => {
    const f = editor();
    const c = f.componentInstance;
    c.setCustomSeo(true);
    c.form.patchValue({ seo_title: 'Título elegido', seo_description: 'Texto elegido' });
    c.form.patchValue({ title: 'Otro proyecto', description: 'Nueva descripción' });
    expect(c.body()).toMatchObject({
      seo_title: 'Título elegido',
      seo_description: 'Texto elegido',
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('[formControlName="seo_title"]').readOnly).toBe(false);
    c.setCustomSeo(false);
    expect(c.body()).toMatchObject({
      seo_title: 'Otro proyecto | Estudio',
      seo_description: 'Nueva descripción',
    });
    expect(c.form.dirty).toBe(true);
  });
  it('preserves existing saved SEO including empty fields until automatic mode is selected', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    const c = f.componentInstance;
    http
      .expectOne(base + '/projects/p')
      .flush({ ...project, seo_title: 'Guardado', seo_description: null });
    c.form.patchValue({ title: 'Nuevo título', short_description: 'Nuevo resumen' });
    expect(c.body()).toMatchObject({ seo_title: 'Guardado', seo_description: null });
    c.setCustomSeo(false);
    c.save();
    const request = http.expectOne(base + '/projects/p');
    expect(request.request.body).toMatchObject({
      seo_title: 'Nuevo título | Estudio',
      seo_description: 'Nuevo resumen',
    });
    request.flush({
      ...project,
      seo_title: 'Nuevo título | Estudio',
      seo_description: 'Nuevo resumen',
    });
    expect(c.customSeo()).toBe(false);
    expect(c.form.pristine).toBe(true);
  });

  it('loads configured studio through the existing service without overwriting custom values', () => {
    const api = TestBed.runInInjectionContext(() => new ContentApi());
    vi.spyOn(TestBed.inject(ContentApi), 'setting').mockImplementation((key) => api.setting(key));
    const f = editor();
    const c = f.componentInstance;
    c.form.controls.title.setValue('Casa');
    expect(c.body().seo_title).toBe('Casa');
    c.setCustomSeo(true);
    c.form.controls.seo_title.setValue('Mi título');
    http
      .expectOne(base + '/site-settings/site_title')
      .flush({ key: 'site_title', value: 'Estudio real', updated_at: 'now' });
    expect(c.body().seo_title).toBe('Mi título');
    c.setCustomSeo(false);
    expect(c.body().seo_title).toBe('Casa | Estudio real');
  });
  it('keeps automatic SEO available when no studio is configured', () => {
    const api = TestBed.runInInjectionContext(() => new ContentApi());
    vi.spyOn(TestBed.inject(ContentApi), 'setting').mockImplementation((key) => api.setting(key));
    const f = editor();
    http
      .expectOne(base + '/site-settings/site_title')
      .flush({ detail: 'missing' }, { status: 404, statusText: 'Not Found' });
    f.componentInstance.form.controls.title.setValue('Casa');
    expect(f.componentInstance.body().seo_title).toBe('Casa');
    expect(f.componentInstance.seoSettingsState()).toBe('ready');
  });

  it('starts without premature errors and guides unsaved media and presentation', () => {
    const f = editor();
    expect(f.nativeElement.querySelectorAll('.field-error').length).toBe(0);
    expect(f.nativeElement.querySelector('#project-save').textContent).toContain(
      'Guardar y continuar',
    );
    for (const tab of ['media', 'sections']) {
      f.componentInstance.tab.set(tab);
      f.detectChanges();
      expect(f.nativeElement.querySelector('app-project-media')).toBeNull();
      expect(f.nativeElement.querySelector('app-project-sections')).toBeNull();
    }
  });
  it('shows local errors after changing and blurring, or after save', () => {
    const f = editor();
    const control = f.componentInstance.form.controls.title;
    control.setValue('   ');
    control.markAsDirty();
    expect(f.componentInstance.invalid('title')).toBe(false);
    control.markAsTouched();
    expect(f.componentInstance.invalid('title')).toBe(true);
    control.setValue('Casa');
    expect(f.componentInstance.invalid('title')).toBe(false);
    control.setValue('');
    f.componentInstance.save();
    expect(f.componentInstance.invalid('title')).toBe(true);
    http.expectNone(() => true);
  });
  it('proposes a normalized link from title without requiring manual input', () => {
    const f = editor();
    f.componentInstance.form.controls.title.setValue(' Casa de Playa en Páracas! ');
    expect(f.componentInstance.form.controls.slug.value).toBe('casa-de-playa-en-paracas');
    f.componentInstance.form.controls.description.setValue('Descripción');
    expect(f.componentInstance.form.controls.slug.value).toBe('casa-de-playa-en-paracas');
  });
  it('preserves personalized links when title changes', () => {
    const f = editor();
    const c = f.componentInstance;
    c.form.controls.title.setValue('Casa');
    c.personalizeLink();
    f.detectChanges();
    const input = f.nativeElement.querySelector('#project-slug') as HTMLInputElement;
    input.value = 'enlace-personal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    c.form.controls.title.setValue('Otro título');
    expect(c.form.controls.slug.value).toBe('enlace-personal');
    expect(c.tab()).toBe('publication');
  });
  it('never regenerates the saved link for an existing project', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    f.componentInstance.form.controls.title.setValue('Título distinto');
    expect(f.componentInstance.form.controls.slug.value).toBe('casa');
    expect(f.componentInstance.form.controls.slug.pristine).toBe(true);
  });
  it('opens files after creating and preserves freely selectable editor areas', () => {
    const f = editor();
    valid(f);
    f.componentInstance.save();
    http.expectOne(base + '/projects').flush(project);
    expect(f.componentInstance.tab()).toBe('media');
    expect(f.componentInstance.tabs.map((t) => t.id)).toEqual([
      'basic',
      'details',
      'cover',
      'media',
      'sections',
      'seo',
      'publication',
    ]);
    for (const tab of f.componentInstance.tabs) {
      f.componentInstance.tab.set(tab.id);
    }
    expect(f.componentInstance.form.controls.title.value).toBe('Casa');
  });
  it('separates details and search appearance and opens the relevant invalid field', () => {
    const f = editor();
    valid(f);
    f.componentInstance.tab.set('details');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#project-panel-details').hidden).toBe(false);
    expect(f.nativeElement.querySelector('#project-panel-basic').hidden).toBe(true);
    f.componentInstance.form.controls.year.setValue(1200);
    f.componentInstance.tab.set('media');
    f.componentInstance.save();
    expect(f.componentInstance.tab()).toBe('details');
    f.componentInstance.form.controls.year.setValue(2026);
    f.componentInstance.form.controls.seo_title.setValue('a'.repeat(201));
    f.componentInstance.save();
    expect(f.componentInstance.tab()).toBe('seo');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#project-panel-seo').hidden).toBe(false);
    expect(f.nativeElement.querySelector('#project-save').getAttribute('form')).toBe(
      'project-form',
    );
    http.expectNone(() => true);
  });
  it('asks before publishing and retains draft state when the server rejects', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    f.componentInstance.form.controls.status.setValue('PUBLISHED');
    f.componentInstance.save();
    http.expectNone(() => true);
    expect(f.componentInstance.confirmation()).toBe('publish');
    f.componentInstance.answer(false);
    http.expectNone(() => true);
    f.componentInstance.save();
    f.componentInstance.answer(true);
    const request = http.expectOne(base + '/projects/p');
    expect(request.request.body.status).toBe('PUBLISHED');
    request.flush(null, { status: 400, statusText: 'Bad request' });
    expect(f.componentInstance.project()?.status).toBe('DRAFT');
    expect(f.componentInstance.form.controls.status.value).toBe('PUBLISHED');
    expect(f.componentInstance.error()).toContain('portada');
  });
  it('warns before changing a published link and sends only the confirmed update', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush({ ...project, status: 'PUBLISHED' });
    f.componentInstance.form.controls.slug.setValue('nueva-direccion');
    f.componentInstance.save();
    http.expectNone(() => true);
    expect(f.componentInstance.confirmation()).toBe('link');
    f.componentInstance.answer(true);
    const request = http.expectOne(base + '/projects/p');
    expect(request.request.body.slug).toBe('nueva-direccion');
    request.flush({ ...project, status: 'PUBLISHED', slug: 'nueva-direccion' });
    expect(f.componentInstance.form.pristine).toBe(true);
  });
  it('saves publication without overwriting the featured selection or manual order', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush({ ...project, is_featured: true, sort_order: 7 });
    const values = {
      status: 'ARCHIVED' as const,
      visibility: 'UNLISTED' as const,
      seo_title: 'Casa en Paracas',
      seo_description: 'Una casa alrededor de un patio',
    };
    f.componentInstance.form.patchValue(values);
    f.componentInstance.save();
    const request = http.expectOne(base + '/projects/p');
    expect(request.request.body).toMatchObject(values);
    expect(request.request.body).not.toHaveProperty('is_featured');
    expect(request.request.body).not.toHaveProperty('sort_order');
    expect(f.componentInstance.form.contains('is_featured')).toBe(false);
    expect(f.componentInstance.form.contains('sort_order')).toBe(false);
    request.flush({ ...project, ...values });
    expect(f.componentInstance.project()).toMatchObject(values);
  });
  it('keeps characteristic creation compact and warns before discarding its draft', () => {
    const f = attributes();
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull();
    f.componentInstance.expanded.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('#attribute-label').getAttribute('placeholder')).toBe(
      'Material principal',
    );
    expect(f.componentInstance.form.controls.label.value).toBe('');
    f.componentInstance.form.controls.label.setValue('Material');
    f.componentInstance.form.markAsDirty();
    f.componentInstance.cancelEdit();
    expect(f.componentInstance.cancelling()).toBe(true);
    f.componentInstance.answer(false);
    expect(f.componentInstance.form.controls.label.value).toBe('Material');
    f.componentInstance.cancelEdit();
    f.componentInstance.answer(true);
    expect(f.componentInstance.expanded()).toBe(false);
    expect(f.componentInstance.hasChanges()).toBe(false);
  });
  it('shows an actionable empty characteristics state and closes after a successful save', () => {
    const f = attributes();
    f.componentInstance.items.set([]);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(
      'Aún no has agregado características adicionales',
    );
    f.componentInstance.expanded.set(true);
    f.componentInstance.form.setValue({ label: 'Escala', value: '1:100' });
    f.componentInstance.save();
    http
      .expectOne(base + '/projects/p/attributes')
      .flush({ ...attribute, label: 'Escala', value: '1:100' });
    flush('/projects/p/attributes', [{ ...attribute, label: 'Escala', value: '1:100' }]);
    expect(f.componentInstance.expanded()).toBe(false);
    expect(f.componentInstance.message()).toContain('Vista previa actualizada');
  });
  it('taxonomy selections remain unsaved until their own assignment succeeds', () => {
    const f = TestBed.createComponent(ProjectTaxonomy);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    flush('/categories');
    flush('/tags');
    flush('/projects/p/categories');
    flush('/projects/p/tags');
    const checkbox = document.createElement('input');
    checkbox.checked = true;
    f.componentInstance.toggle('categories', 'c', { target: checkbox } as unknown as Event);
    expect(f.componentInstance.hasChanges()).toBe(true);
    f.componentInstance.accept();
    http.expectOne(base + '/projects/p/categories').flush(null);
    expect(f.componentInstance.hasChanges()).toBe(false);
  });

  it('protects a characteristic draft when leaving the project and preserves it on cancel', async () => {
    const f = editor();
    const child = TestBed.createComponent(ProjectAttributes);
    child.componentInstance.form.controls.label.setValue('Material');
    child.componentInstance.form.markAsDirty();
    vi.spyOn(f.componentInstance, 'attributes').mockReturnValue(child.componentInstance);
    const answer = f.componentInstance.canLeave();
    expect(f.componentInstance.confirmation()).toBe('leave');
    f.componentInstance.answer(false);
    expect(await answer).toBe(false);
    expect(child.componentInstance.form.controls.label.value).toBe('Material');
  });
  it('protects unassigned classification selections when leaving', async () => {
    const f = editor();
    const child = TestBed.createComponent(ProjectTaxonomy);
    child.componentInstance.changed.set(['categories']);
    vi.spyOn(f.componentInstance, 'taxonomy').mockReturnValue(child.componentInstance);
    const answer = f.componentInstance.canLeave();
    f.componentInstance.answer(false);
    expect(await answer).toBe(false);
    expect(child.componentInstance.hasChanges()).toBe(true);
  });
  it('offers the six real file groups and keeps group selection independent of its queue', () => {
    const f = TestBed.createComponent(ProjectMedia);
    f.detectChanges();
    expect(f.componentInstance.roles.map((r) => r.value)).toEqual([
      'COVER',
      'GALLERY',
      'PLAN',
      'RENDER',
      'DOCUMENT',
      'MODEL',
    ]);
    for (const group of f.componentInstance.roles) {
      f.componentInstance.group.set(group.value);
      expect(f.componentInstance.activeGroup()).toBe(group.value);
      expect(f.componentInstance.visible(group.value)).toBe(true);
    }
    expect(f.componentInstance.queue.jobs()).toEqual([]);
  });
  function valid(f: ReturnType<typeof editor>) {
    f.componentInstance.form.patchValue({ title: 'Casa', slug: 'casa' });
  }
  it('requires title/slug and validates integer year, positive precision area', () => {
    const f = editor();
    f.componentInstance.save();
    http.expectNone(() => true);
    valid(f);
    f.componentInstance.form.patchValue({ year: 2020.5, area_m2: '-1' });
    expect(f.componentInstance.form.invalid).toBe(true);
    f.componentInstance.form.patchValue({ year: 2020, area_m2: '12.25' });
    expect(f.componentInstance.form.valid).toBe(true);
  });
  it('creates once, sends nullable values and navigates to stable edit UUID', () => {
    const f = editor();
    valid(f);
    f.componentInstance.save();
    f.componentInstance.save();
    const r = http.expectOne(base + '/projects');
    expect(r.request.body).toMatchObject({
      title: 'Casa',
      slug: 'casa',
      location: null,
      year: null,
    });
    expect(r.request.body).not.toHaveProperty('is_featured');
    expect(r.request.body).not.toHaveProperty('sort_order');
    r.flush(project);
    expect(f.componentInstance.form.pristine).toBe(true);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/admin/projects', 'p', 'edit'], {
      state: { createdProject: true },
    });
  });
  it('maps 422 to fields and retains form values', () => {
    const f = editor();
    valid(f);
    f.componentInstance.save();
    http
      .expectOne(base + '/projects')
      .flush(
        { detail: [{ loc: ['body', 'slug'], msg: 'invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Invalid' },
      );
    expect(f.componentInstance.form.controls.slug.hasError('backend')).toBe(true);
    expect(f.componentInstance.form.controls.title.value).toBe('Casa');
    expect(f.componentInstance.saving()).toBe(false);
  });
  it('creates one minimal draft before upload and retains unsaved editor fields', () => {
    const f = editor();
    valid(f);
    f.componentInstance.form.controls.description.setValue('Pending long description');
    f.componentInstance.ensureDraft();
    f.componentInstance.ensureDraft();
    const request = http.expectOne(base + '/projects');
    expect(request.request.body).toEqual({
      title: 'Casa',
      slug: 'casa',
      status: 'DRAFT',
      visibility: 'PUBLIC',
    });
    request.flush(project);
    expect(f.componentInstance.id).toBe('p');
    expect(f.componentInstance.form.controls.description.value).toBe('Pending long description');
    expect(f.componentInstance.form.dirty).toBe(true);
    f.componentInstance.ensureDraft();
    http.expectNone(() => true);
    f.componentInstance.save();
    const update = http.expectOne(base + '/projects/p');
    expect(update.request.method).toBe('PATCH');
    update.flush({ ...project, description: 'Pending long description' });
  });
  it('invalid initial data prevents creating an upload draft', () => {
    const f = editor();
    f.componentInstance.tab.set('cover');
    f.componentInstance.ensureDraft();
    expect(f.componentInstance.tab()).toBe('basic');
    expect(f.componentInstance.error()).toContain('enlace');
    http.expectNone(() => true);
  });
  it('failed draft creation retains inputs and is safely retryable', () => {
    const f = editor();
    valid(f);
    f.componentInstance.ensureDraft();
    http.expectOne(base + '/projects').flush(null, { status: 409, statusText: 'Conflict' });
    expect(f.componentInstance.id).toBeNull();
    expect(f.componentInstance.saving()).toBe(false);
    expect(f.componentInstance.form.controls.title.value).toBe('Casa');
    f.componentInstance.ensureDraft();
    http.expectOne(base + '/projects').flush(project);
    expect(f.componentInstance.id).toBe('p');
  });
  it('explains slug conflict without raw diagnostics', () => {
    const f = editor();
    valid(f);
    f.componentInstance.save();
    http
      .expectOne(base + '/projects')
      .flush({ detail: 'secret constraint diagnostics' }, { status: 409, statusText: 'Conflict' });
    expect(f.componentInstance.error()).toContain('enlace');
    expect(f.componentInstance.error()).not.toContain('secret');
    expect(f.componentInstance.form.controls.slug.value).toBe('casa');
  });
  it('network failure preserves entered data', () => {
    const f = editor();
    valid(f);
    f.componentInstance.save();
    http.expectOne(base + '/projects').error(new ProgressEvent('error'));
    expect(f.componentInstance.form.controls.title.value).toBe('Casa');
    expect(f.componentInstance.form.enabled).toBe(true);
  });
  it('loads and updates actual project without dirtying initial form', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    expect(f.componentInstance.form.pristine).toBe(true);
    f.componentInstance.form.controls.title.setValue('Nueva casa');
    f.componentInstance.save();
    const r = http.expectOne(base + '/projects/p');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body.title).toBe('Nueva casa');
    r.flush({ ...project, title: 'Nueva casa' });
    expect(f.componentInstance.success()).toContain('guardado');
  });
  it('distinguishes nonexistent project', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http
      .expectOne(base + '/projects/p')
      .flush({ detail: 'not found' }, { status: 404, statusText: 'Not found' });
    expect(f.componentInstance.state()).toBe('error');
    expect(f.componentInstance.error()).toContain('disponible');
  });
  it('clears the save confirmation after three seconds', () => {
    vi.useFakeTimers();
    try {
      route.snapshot.paramMap = convertToParamMap({ id: 'p' });
      const f = TestBed.createComponent(ProjectEditor);
      http.expectOne(base + '/projects/p').flush(project);
      f.componentInstance.form.controls.title.setValue('Nueva casa');
      f.componentInstance.save();
      http.expectOne(base + '/projects/p').flush({ ...project, title: 'Nueva casa' });
      vi.advanceTimersByTime(2999);
      for (const request of http.match((r) => r.method === 'GET')) {
        request.flush({ items: [], total: 0, limit: 100, offset: 0 });
      }
      expect(f.componentInstance.success()).toBe('Proyecto guardado.');
      vi.advanceTimersByTime(1);
      expect(f.componentInstance.success()).toBe('');
      for (const request of http.match((r) => r.method === 'GET')) {
        request.flush({ items: [], total: 0, limit: 100, offset: 0 });
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it('loads the new UUID when Angular reuses an edit route', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    route.paramMap.next(convertToParamMap({ id: 'q' }));
    expect(f.componentInstance.state()).toBe('loading');
    http.expectOne(base + '/projects/q').flush({ ...project, id: 'q', title: 'Otro' });
    expect(f.componentInstance.id).toBe('q');
    expect(f.componentInstance.form.controls.title.value).toBe('Otro');
  });
  it('asks only for dirty changes and supports cancel/leave', async () => {
    const f = editor();
    expect(f.componentInstance.canLeave()).toBe(true);
    f.componentInstance.form.markAsDirty();
    let result = f.componentInstance.canLeave();
    expect(f.componentInstance.confirmation()).toBe('leave');
    f.componentInstance.answer(false);
    expect(await result).toBe(false);
    result = f.componentInstance.canLeave();
    f.componentInstance.answer(true);
    expect(await result).toBe(true);
  });
  it('soft delete requires acceptance and navigates only on success', () => {
    route.snapshot.paramMap = convertToParamMap({ id: 'p' });
    const f = TestBed.createComponent(ProjectEditor);
    http.expectOne(base + '/projects/p').flush(project);
    f.componentInstance.confirmation.set('delete');
    f.componentInstance.answer(false);
    http.expectNone(() => true);
    f.componentInstance.confirmation.set('delete');
    f.componentInstance.answer(true);
    http.expectOne(base + '/projects/p').flush(null, { status: 204, statusText: 'No content' });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/admin/projects']);
  });
  function taxonomy() {
    const f = TestBed.createComponent(ProjectTaxonomy);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    flush('/categories', [{ id: 'c', name: 'Casa' }]);
    flush('/tags', [{ id: 't', name: 'Madera' }]);
    flush('/projects/p/categories', [{ id: 'c', name: 'Casa' }]);
    flush('/projects/p/tags');
    return f;
  }
  it('taxonomy initial state and assignment removal persisted', () => {
    const f = taxonomy();
    expect(f.componentInstance.selection().categories).toEqual(['c']);
    f.componentInstance.selection.set({ categories: [], tags: ['t'] });
    f.componentInstance.changed.set(['categories']);
    f.componentInstance.accept();
    const r = http.expectOne(base + '/projects/p/categories');
    expect(r.request.body).toEqual({ ids: [] });
    r.flush(null);
    expect(f.componentInstance.selection().categories).toEqual([]);
  });
  it('assignment failure keeps chosen IDs and prevents duplicate saves', () => {
    const f = taxonomy();
    f.componentInstance.selection.set({ categories: ['c'], tags: ['t'] });
    f.componentInstance.changed.set(['tags']);
    f.componentInstance.accept();
    f.componentInstance.accept();
    http
      .expectOne(base + '/projects/p/tags')
      .flush({ detail: 'missing' }, { status: 404, statusText: 'Not found' });
    expect(f.componentInstance.selection().tags).toEqual(['t']);
    expect(f.componentInstance.busy()).toBe(false);
  });
  it('tag creation uses real API and deduplicates available items', () => {
    const f = TestBed.createComponent(TaxonomyPage);
    f.detectChanges();
    flush('/categories');
    flush('/tags', [{ id: 't', name: 'Madera' }]);
    f.componentInstance.createForm.setValue({ kind: 'tags', name: 'Madera' });
    f.componentInstance.create();
    http
      .expectOne(base + '/tags')
      .flush({ id: 't', name: 'Madera', slug: 'madera', created_at: 'now' });
    expect(f.componentInstance.available().tags).toHaveLength(1);
  });
  it('shows friendly empty classification links without creation controls', () => {
    const f = TestBed.createComponent(ProjectTaxonomy);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    for (const path of ['/categories', '/tags', '/projects/p/categories', '/projects/p/tags'])
      flush(path);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Todavía no hay categorías disponibles');
    expect(f.nativeElement.querySelectorAll('a[href="/admin/taxonomy"]').length).toBe(2);
    expect(f.nativeElement.querySelector('form')).toBeNull();
  });
  it('creates categories once and preserves rejected tag values', () => {
    const f = TestBed.createComponent(TaxonomyPage);
    f.detectChanges();
    flush('/categories');
    flush('/tags');
    f.componentInstance.createForm.controls.name.setValue('Vivienda');
    f.componentInstance.create();
    f.componentInstance.create();
    const request = http.expectOne(base + '/categories');
    expect(request.request.body).toEqual({ name: 'Vivienda', slug: 'vivienda' });
    request.flush({ id: 'c', name: 'Vivienda', slug: 'vivienda' });
    expect(f.componentInstance.available().categories.length).toBe(1);
    f.componentInstance.createForm.setValue({ kind: 'tags', name: 'Madera' });
    f.componentInstance.create();
    http
      .expectOne(base + '/tags')
      .flush(
        { detail: [{ loc: ['body', 'slug'], msg: 'invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Invalid' },
      );
    expect(f.componentInstance.error()).toContain('Revisa los campos');
    expect(f.componentInstance.createForm.controls.name.value).toBe('Madera');
    expect(f.componentInstance.busy()).toBe(false);
  });
  it('generates classification slugs from the current name and type without an input', () => {
    const f = TestBed.createComponent(TaxonomyPage);
    f.detectChanges();
    flush('/categories');
    flush('/tags');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#taxon-slug')).toBeNull();
    f.componentInstance.createForm.setValue({ kind: 'categories', name: ' Diseño interior! ' });
    f.componentInstance.create();
    const category = http.expectOne(base + '/categories');
    expect(category.request.body).toEqual({ name: 'Diseño interior!', slug: 'diseno-interior' });
    category.flush({ id: 'c', name: 'Diseño interior!', slug: 'diseno-interior' });
    f.componentInstance.createForm.setValue({ kind: 'tags', name: 'Áreas verdes' });
    f.componentInstance.create();
    const tag = http.expectOne(base + '/tags');
    expect(tag.request.body).toEqual({ name: 'Áreas verdes', slug: 'areas-verdes' });
    tag.flush({ id: 't', name: 'Áreas verdes', slug: 'areas-verdes' });
    f.componentInstance.createForm.controls.name.setValue('!!!');
    f.componentInstance.create();
    http.expectNone((r) => r.method === 'POST');
    expect(f.componentInstance.error()).toContain('Revisa el nombre');
  });
  it('taxonomy failure prevents unsafe replacement before initial load', () => {
    const f = TestBed.createComponent(ProjectTaxonomy);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    http
      .expectOne((r) => r.url === base + '/categories')
      .flush({ detail: 'error' }, { status: 500, statusText: 'Error' });
    http.match(() => true);
    expect(f.componentInstance.ready()).toBe(false);
  });
  const attribute = {
    id: 'a',
    project_id: 'p',
    label: 'Autor',
    value: 'Nombre',
    sort_order: 0,
    created_at: 'now',
    updated_at: 'now',
  };
  function attributes() {
    const f = TestBed.createComponent(ProjectAttributes);
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    flush('/projects/p/attributes', [attribute]);
    return f;
  }
  it('adds and edits attributes then reads authoritative collection', () => {
    const f = attributes();
    f.componentInstance.form.setValue({ label: 'Tipo', value: 'Casa' });
    f.componentInstance.save();
    http.expectOne(base + '/projects/p/attributes').flush({ ...attribute, id: 'b' });
    flush('/projects/p/attributes', [attribute, { ...attribute, id: 'b' }]);
    expect(f.componentInstance.items()).toHaveLength(2);
    f.componentInstance.edit(attribute);
    f.componentInstance.form.controls.value.setValue('Otro');
    f.componentInstance.save();
    const r = http.expectOne(base + '/projects/p/attributes/a');
    expect(r.request.body.value).toBe('Otro');
    r.flush({ ...attribute, value: 'Otro' });
    flush('/projects/p/attributes', [{ ...attribute, value: 'Otro' }]);
  });
  it('deletes attributes only after server success', () => {
    const f = attributes();
    f.componentInstance.remove(attribute);
    http.expectOne(base + '/projects/p/attributes/a').flush(null);
    flush('/projects/p/attributes');
    expect(f.componentInstance.items()).toEqual([]);
  });
  it('reorders attributes once per final action and preserves original on failure', () => {
    const f = attributes();
    f.componentInstance.items.set([attribute, { ...attribute, id: 'b', sort_order: 1 }]);
    f.componentInstance.move(1, -1);
    const r = http.expectOne(base + '/projects/p/attributes/order');
    expect(r.request.body.items).toEqual([
      { id: 'b', sort_order: 0 },
      { id: 'a', sort_order: 1 },
    ]);
    r.flush({ detail: 'failure' }, { status: 500, statusText: 'Error' });
    flush('/projects/p/attributes', [attribute, { ...attribute, id: 'b', sort_order: 1 }]);
    expect(f.componentInstance.items()[0].id).toBe('a');
  });
  const link = {
    id: 'l',
    project_id: 'p',
    media_id: 'm',
    role: 'GALLERY' as const,
    sort_order: 0,
    created_at: 'now',
  };
  function media() {
    const f = TestBed.createComponent(ProjectMedia);
    f.componentRef.setInput('mode', 'gallery');
    f.componentRef.setInput('projectId', 'p');
    f.detectChanges();
    flush('/projects/p/media', [link]);
    flush('/projects/p/sections');
    http.expectOne(base + '/media/m').flush(asset);
    return f;
  }
  it('loads existing files and offers direct upload without choosing from the library', () => {
    const f = media();
    f.detectChanges();
    expect(f.componentInstance.links()).toEqual([link]);
    expect(f.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('app-project-media-picker')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Elegir de biblioteca');
    expect(f.nativeElement.textContent).not.toContain('Uso en el proyecto');
    expect(f.nativeElement.querySelector('.asset-info select')).toBeNull();
    expect(f.nativeElement.querySelector('.asset-info .badge')).toBeNull();
    http.expectOne(base + '/media/m/content').flush(new Blob(['image']));
    http.expectNone((r) => r.url === base + '/media');
    http.expectNone((r) => r.method === 'PUT' || r.method === 'POST');
  });
  it('separates cover and photographs tabs while retaining presentation', () => {
    const f = editor();
    expect(f.componentInstance.tabs.map((tab) => tab.label)).toEqual([
      'Información del proyecto',
      'Datos del proyecto',
      'Portada',
      'Fotografías',
      'Presentación del proyecto',
      'Apariencia en Google',
      'Publicación',
    ]);
  });
  it('shows existing plans and renders as photographs without covers, other media or duplicate images', () => {
    const f = media();
    const c = f.componentInstance;
    const links = [
      { ...link, id: 'cover', media_id: 'cover', role: 'COVER' as const },
      { ...link, id: 'plan', media_id: 'plan', role: 'PLAN' as const },
      { ...link, id: 'render', media_id: 'render', role: 'RENDER' as const },
      { ...link, id: 'duplicate', media_id: 'plan' },
      { ...link, id: 'video', media_id: 'video' },
    ];
    c.links.set(links);
    c.assets.set({
      cover: { ...asset, id: 'cover' },
      plan: { ...asset, id: 'plan' },
      render: { ...asset, id: 'render' },
      video: { ...asset, id: 'video', type: 'VIDEO' },
    });
    expect(
      links.filter((item, index) => c.visibleFile(item, index)).map((item) => item.id),
    ).toEqual(['plan', 'render']);
    const queue = vi.spyOn(c.queue, 'add');
    c.addFiles([new File(['pdf'], 'document.pdf', { type: 'application/pdf' })], 'GALLERY');
    expect(queue).not.toHaveBeenCalled();
    expect(c.error()).toContain('imágenes');
  });
  it('presents the cover above upload and saves alternative text through the existing media API', () => {
    const f = media();
    const c = f.componentInstance;
    f.componentRef.setInput('mode', 'cover');
    c.links.set([{ ...link, role: 'COVER' }]);
    f.detectChanges();
    http.expectOne(base + '/media/m/content').flush(new Blob(['image']));
    const preview = f.nativeElement.querySelector('.cover-preview');
    const upload = f.nativeElement.querySelector('.cover-upload');
    expect(preview.compareDocumentPosition(upload) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(preview.querySelector('.preview.cover.contain')).not.toBeNull();
    expect(preview.querySelector('.preview.panoramic')).toBeNull();
    expect(f.nativeElement.querySelector('.project-media-grid').hidden).toBe(true);
    const input = f.nativeElement.querySelector('#project-cover-alt') as HTMLInputElement;
    input.value = 'Fachada principal';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(c.hasChanges()).toBe(true);
    c.saveCoverAlt();
    const request = http.expectOne(base + '/media/m');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ alt_text: 'Fachada principal' });
    request.flush({ ...asset, alt_text: 'Fachada principal' });
    f.detectChanges();
    expect(c.coverMetadata.pristine).toBe(true);
    expect(c.assets()['m'].alt_text).toBe('Fachada principal');
  });
  it('preserves the cover alternative text on validation failure and prevents invalid submissions', () => {
    const f = media();
    const c = f.componentInstance;
    f.componentRef.setInput('mode', 'cover');
    c.links.set([{ ...link, role: 'COVER' }]);
    f.detectChanges();
    http.expectOne(base + '/media/m/content').flush(new Blob(['image']));
    c.coverMetadata.controls.alt_text.setValue('a'.repeat(256));
    c.saveCoverAlt();
    http.expectNone(base + '/media/m');
    c.coverMetadata.controls.alt_text.setValue('Texto elegido');
    c.coverMetadata.markAsDirty();
    c.saveCoverAlt();
    c.saveCoverAlt();
    http
      .expectOne(base + '/media/m')
      .flush(
        { detail: [{ loc: ['body', 'alt_text'], msg: 'Invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(c.coverMetadata.controls.alt_text.value).toBe('Texto elegido');
    expect(c.coverMetadata.dirty).toBe(true);
    expect(c.error()).not.toBe('');
  });
  it('protected published cover detach error keeps relation', () => {
    const f = media();
    f.componentInstance.detach(link);
    http
      .expectOne(base + '/projects/p/media/l')
      .flush({ detail: 'protected' }, { status: 409, statusText: 'Conflict' });
    expect(f.componentInstance.links()).toHaveLength(1);
  });
  it('orders media using relation IDs and reloads without duplicate downloads', () => {
    const f = media();
    f.componentInstance.assets.update((assets) => ({ ...assets, m2: { ...asset, id: 'm2' } }));
    f.componentInstance.links.set([link, { ...link, id: 'l2', media_id: 'm2', sort_order: 1 }]);
    f.componentInstance.move(1, -1);
    const r = http.expectOne(base + '/projects/p/media/order');
    expect(r.request.body.items[0].id).toBe('l2');
    r.flush(null);
    flush('/projects/p/media', [{ ...link, id: 'l2', media_id: 'm2' }, link]);
    http.expectNone(base + '/media/m');
  });
  it('private preview reuses authorized content endpoint', () => {
    const f = media();
    f.detectChanges();
    const button = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Ver imagen'));
    expect(button).toBeUndefined();
    http.expectOne(base + '/media/m/content').flush(new Blob(['test']));
    http.expectNone((r) => r.url.includes('r2'));
  });
  it('saves a dropped photograph once, preserving hidden relations, and restores server order on failure', () => {
    const f = media();
    const c = f.componentInstance;
    const cover = { ...link, id: 'cover', role: 'COVER' as const };
    const second = { ...link, id: 'l2', media_id: 'm2', role: 'PLAN' as const };
    const duplicate = { ...link, id: 'duplicate' };
    c.assets.update((assets) => ({ ...assets, m2: { ...asset, id: 'm2' } }));
    const original = [cover, link, second, duplicate];
    c.links.set(original);
    c.reorderPhotographs(0, 1, false);
    c.reorderPhotographs(0, 0, true);
    http.expectNone(base + '/projects/p/media/order');
    c.reorderPhotographs(0, 1, true);
    c.reorderPhotographs(1, 0, true);
    const request = http.expectOne(base + '/projects/p/media/order');
    expect(request.request.body.items).toEqual([
      { id: 'cover', sort_order: 0 },
      { id: 'l2', sort_order: 1 },
      { id: 'l', sort_order: 2 },
      { id: 'duplicate', sort_order: 3 },
    ]);
    expect(c.links().map((item) => item.id)).toEqual(['cover', 'l2', 'l', 'duplicate']);
    request.flush({ detail: 'failure' }, { status: 500, statusText: 'Error' });
    flush('/projects/p/media', original);
    flush('/projects/p/sections');
    expect(c.links()).toEqual(original);
    expect(c.error()).not.toBe('');
  });
  it('closes file details when changing subsection and does not reopen them on return', () => {
    const f = media();
    const c = f.componentInstance;
    f.componentRef.setInput('mode', 'all');
    c.group.set('GALLERY');
    f.detectChanges();
    http.expectOne(base + '/media/m/content').flush(new Blob(['image']));
    for (const group of ['COVER', 'PLAN', 'RENDER', 'DOCUMENT', 'MODEL'] as const) {
      c.editMetadata(asset);
      c.metadata.controls.title.setValue('Unsaved title');
      c.metadata.markAsDirty();
      f.detectChanges();
      expect(f.nativeElement.querySelector('.metadata-editor')).not.toBeNull();
      c.group.set(group);
      f.detectChanges();
      expect(c.metadataId()).toBeNull();
      expect(c.metadata.pristine).toBe(true);
      expect(f.nativeElement.querySelector('.metadata-editor')).toBeNull();
      c.group.set('GALLERY');
      f.detectChanges();
      expect(f.nativeElement.querySelector('.metadata-editor')).toBeNull();
    }
    c.editMetadata(asset);
    f.detectChanges();
    expect(c.metadata.controls.title.value).toBe(asset.title ?? '');
    c.group.set('GALLERY');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.metadata-editor')).not.toBeNull();
    http.expectNone((r) => r.method === 'PATCH');
  });

  it('persists shared alternative text and description without uploading again', () => {
    const f = media();
    f.componentInstance.editMetadata(asset);
    f.componentInstance.metadata.controls.alt_text.setValue('Fachada principal');
    f.componentInstance.metadata.controls.description.setValue('Descripción del archivo');
    f.componentInstance.saveMetadata();
    const request = http.expectOne(base + '/media/m');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      title: null,
      alt_text: 'Fachada principal',
      description: 'Descripción del archivo',
    });
    f.componentInstance.saveMetadata();
    http.expectNone(base + '/media/m');
    request.flush({
      ...asset,
      alt_text: 'Fachada principal',
      description: 'Descripción del archivo',
    });
    expect(f.componentInstance.assets()['m'].alt_text).toBe('Fachada principal');
    http.expectNone((r) => r.method === 'PUT' || r.method === 'DELETE');
  });
  it('selector paginates actual MediaApi and emits real asset', () => {
    const f = TestBed.createComponent(ProjectMediaPicker);
    f.detectChanges();
    http
      .expectOne((r) => r.url === base + '/media')
      .flush({ items: [asset], total: 20, limit: 12, offset: 0 });
    f.componentInstance.load(12);
    http
      .expectOne((r) => r.url === base + '/media' && r.params.get('offset') === '12')
      .flush({ items: [asset], total: 20, limit: 12, offset: 12 });
    expect(f.componentInstance.page()?.offset).toBe(12);
  });
});
