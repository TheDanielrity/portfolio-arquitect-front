import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router, convertToParamMap } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';
import { PublicHome } from '../home/home';
import { PublicContentApi } from '../content/public-content-api';
import { emptyPublicContentApi } from '../content/public-content.testing';
import { PublicProjectsApi } from './public-projects-api';
import { PublicProjectCollection, publicProjectError } from './public-project-collection';
import { ProjectIndex } from './project-index';
import { ProjectPreview } from './project-preview';
import { PublicCover } from './public-cover';
import { ProjectSpotlight } from './project-spotlight';
import { PublicProjectsPage, projectQuery } from './public-projects-page';
import { publicRoutes } from '../public.routes';
import { ApiError } from '../../../core/api/api-error';
import { card, category, page, emptyPage } from './public-projects.testing';
import type { PagePublicProjectCard } from '../../../core/api/generated/types.gen';
function apiMock() {
  return {
    list: vi.fn(() => of(page())),
    featured: vi.fn(() => of(page([card], { limit: 1 }))),
    categoryOptions: vi.fn(() => of([category])),
  };
}
describe('Public portfolio Home', () => {
  let api: ReturnType<typeof apiMock>;
  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(publicRoutes),
        { provide: PublicProjectsApi, useValue: api },
        { provide: PublicContentApi, useFactory: emptyPublicContentApi },
      ],
    });
  });
  it('recovers category options independently without reloading projects', () => {
    api.categoryOptions.mockReturnValueOnce(throwError(() => new Error('Unavailable')));
    const fixture = TestBed.createComponent(PublicHome);
    fixture.detectChanges();
    const retry = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Reintentar categorías'))!;
    expect(retry).toBeDefined();
    retry.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Category options are temporarily');
    expect(api.categoryOptions).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate category requests while a retry is pending', () => {
    const pending = new Subject<(typeof category)[]>();
    api.categoryOptions.mockReturnValueOnce(pending);
    const fixture = TestBed.createComponent(PublicHome);
    fixture.detectChanges();
    fixture.componentInstance.collection.retryCategories();
    expect(api.categoryOptions).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Cargando categorías');
    pending.next([category]);
    pending.complete();
    fixture.detectChanges();
    expect(fixture.componentInstance.collection.categoryLoading()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Cargando categorías');
  });
  it('renders real hero, Selected Projects, Index and Featured Project with slug links', () => {
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    const e = f.nativeElement as HTMLElement;
    expect(e.querySelector('h1')?.textContent).toContain(card.title);
    expect(e.querySelectorAll('app-project-spotlight')).toHaveLength(2);
    expect(e.querySelectorAll('app-project-preview')).toHaveLength(1);
    expect(e.querySelector('.index-rows')?.textContent).toContain(card.title);
    expect(e.querySelector('app-project-preview a')?.getAttribute('href')).toBe(
      '/projects/' + card.slug,
    );
    expect(e.querySelector('app-project-spotlight img')?.getAttribute('src')).toBe(card.cover!.url);
    expect(e.textContent).not.toMatch(/Casa Bruma|Monolito|Mateo|ARCHITECTURE THAT SHAPES/);
  });
  it('uses a single original image behind the banner content', () => {
    const fixture = TestBed.createComponent(PublicHome);
    fixture.detectChanges();
    const foreground = fixture.nativeElement.querySelector(
      'app-project-spotlight .backdrop img',
    ) as HTMLImageElement;
    expect(foreground.getAttribute('src')).toBe(card.cover!.url);
    expect(
      fixture.nativeElement
        .querySelector('app-project-spotlight')
        .querySelectorAll('app-public-cover'),
    ).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.backdrop-blur')).toBeNull();
  });
  it('shows complete images in both homepage banners without changing card proportions', () => {
    const fixture = TestBed.createComponent(PublicHome);
    fixture.detectChanges();
    const images = fixture.nativeElement.querySelectorAll(
      'app-project-spotlight img',
    ) as NodeListOf<HTMLImageElement>;
    expect(images).toHaveLength(2);
    expect(images[0].style.objectFit).toBe('fill');
    expect(images[1].style.objectFit).toBe('fill');
    expect(
      (fixture.nativeElement.querySelector('app-project-preview img') as HTMLImageElement).style
        .objectFit,
    ).toBe('cover');
  });
  it('stretches the project detail banner to show the complete cover', () => {
    const fixture = TestBed.createComponent(ProjectSpotlight);
    fixture.componentRef.setInput('project', card);
    fixture.componentRef.setInput('detail', true);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('img') as HTMLImageElement).style.objectFit).toBe(
      'fill',
    );
  });
  it('limits selected projects to four while retaining twelve in the Index', () => {
    api.list.mockReturnValue(
      of(page(Array.from({ length: 12 }, (_, i) => ({ ...card, slug: 'project-' + i })))),
    );
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-project-preview')).toHaveLength(4);
    expect(f.nativeElement.querySelectorAll('.index-rows li')).toHaveLength(12);
  });
  it.each([0, 1, 2, 4, 7])('handles %i public projects without inventing extra entries', (n) => {
    api.list.mockReturnValue(
      of(page(Array.from({ length: n }, (_, i) => ({ ...card, slug: 'project-' + i })))),
    );
    api.featured.mockReturnValue(of(emptyPage));
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-project-preview')).toHaveLength(Math.min(n, 4));
    expect(f.nativeElement.querySelectorAll('app-project-spotlight')).toHaveLength(n ? 1 : 0);
  });
  it('omits featured when absent and chooses the first listed real image for Hero', () => {
    api.featured.mockReturnValue(of(emptyPage));
    api.list.mockReturnValue(of(page([{ ...card, slug: 'no-cover', cover: null }, card])));
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.componentInstance.hero()?.slug).toBe(card.slug);
    expect(f.nativeElement.querySelectorAll('app-project-spotlight')).toHaveLength(1);
  });
  it('does not use the temporary image when no projects exist', () => {
    api.list.mockReturnValue(of(emptyPage));
    api.featured.mockReturnValue(of(emptyPage));
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Aún no se han publicado proyectos.');
  });
  it('keeps the real collection usable if featured retrieval fails', () => {
    api.featured.mockReturnValue(throwError(() => new ApiError(500, 'internal', [], null, null)));
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('app-project-preview')).toHaveLength(1);
    expect(f.nativeElement.textContent).toContain(
      'Los proyectos destacados no están disponibles temporalmente.',
    );
  });
  it('shows safe errors and offers retry without exposing internal detail', () => {
    api.list.mockReturnValue(
      throwError(() => new ApiError(500, 'secret stack', [], null, 'internal-id')),
    );
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain(
      'Los proyectos no están disponibles temporalmente.',
    );
    expect(f.nativeElement.textContent).not.toMatch(/secret stack|internal-id/);
    (f.nativeElement.querySelector('[role=alert] button') as HTMLButtonElement).click();
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it('does not rewrite Selected Projects when Index category changes', () => {
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    api.list.mockReturnValue(of(page([])));
    (f.nativeElement.querySelector('.filters button:nth-child(2)') as HTMLButtonElement).click();
    f.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith({ limit: 12, offset: 0, category: 'architecture' });
    expect(f.nativeElement.querySelectorAll('app-project-preview')).toHaveLength(1);
    expect(f.nativeElement.textContent).toContain(
      'No hay proyectos que coincidan con estos filtros.',
    );
  });
});
describe('Public collection loading and concurrency', () => {
  it('starts loading, keeps previous entries during refresh, and cancels obsolete requests', () => {
    const a = new Subject<PagePublicProjectCard>(),
      b = new Subject<PagePublicProjectCard>();
    const api = apiMock();
    api.list.mockReturnValueOnce(a).mockReturnValueOnce(b);
    TestBed.configureTestingModule({
      providers: [PublicProjectCollection, { provide: PublicProjectsApi, useValue: api }],
    });
    const c = TestBed.inject(PublicProjectCollection);
    c.load({ limit: 12 });
    expect(c.loading()).toBe(true);
    a.next(page());
    expect(c.loading()).toBe(false);
    c.load({ limit: 12, category: 'architecture' });
    expect(c.page()?.items).toHaveLength(1);
    expect(c.loading()).toBe(true);
    a.next(page([{ ...card, slug: 'obsolete' }]));
    expect(c.page()?.items[0].slug).toBe(card.slug);
    b.next(page([]));
    expect(c.page()?.items).toHaveLength(0);
    expect(c.initialPage()?.items).toHaveLength(1);
  });
  it('maps network/validation/rate/auth errors to safe messages', () => {
    expect(publicProjectError(new ApiError(0, null, [], null, null))).toContain('conexión');
    expect(publicProjectError(new ApiError(422, null, [], null, null))).toContain('filtros');
    expect(publicProjectError(new ApiError(429, null, [], null, null))).toContain('Espera');
    expect(publicProjectError(new ApiError(401, null, [], null, null))).toContain('al público');
  });
});
describe('Public index filters, pagination and pointer preview', () => {
  function setup(p = page([card], { total: 30, limit: 12, offset: 12 })) {
    const c = {
      page: signal(p),
      query: signal({ limit: 12, offset: 12, category: null, tag: null }),
      loading: signal(false),
      error: signal<unknown>(null),
      categories: signal([category]),
      categoryError: signal(false),
      categoryLoading: signal(false),
      retryCategories: vi.fn(),
      retry: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter(publicRoutes), { provide: PublicProjectCollection, useValue: c }],
    });
    const f = TestBed.createComponent(ProjectIndex);
    f.detectChanges();
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    return { f, c, changed };
  }
  it('filters using backend slugs and resets offset', () => {
    const { f, changed } = setup();
    (f.nativeElement.querySelector('.filters button:nth-child(2)') as HTMLButtonElement).click();
    expect(changed).toHaveBeenCalledWith({
      limit: 12,
      offset: 0,
      category: 'architecture',
      tag: null,
    });
  });
  it('does not expose technical tag-slug controls to visitors', () => {
    const { f } = setup();
    expect(f.nativeElement.querySelector('#public-tag')).toBeNull();
    expect(f.nativeElement.textContent).not.toMatch(/Tag slug|Apply an exact tag slug/);
  });
  it('uses correct next/previous offsets and sequence', () => {
    const { f, changed } = setup();
    expect(f.nativeElement.querySelector('.sequence').textContent).toBe('13');
    const buttons = f.nativeElement.querySelectorAll('.pagination button');
    buttons[1].click();
    expect(changed).toHaveBeenLastCalledWith({ limit: 12, offset: 24, category: null, tag: null });
    buttons[0].click();
    expect(changed).toHaveBeenLastCalledWith({ limit: 12, offset: 0, category: null, tag: null });
  });
  it('blocks duplicate pagination while loading', () => {
    const { f, c, changed } = setup();
    c.loading.set(true);
    f.detectChanges();
    (f.nativeElement.querySelector('.pagination button') as HTMLButtonElement).click();
    expect(changed).not.toHaveBeenCalled();
  });
  it('keeps the index stable and blocks category changes until loading finishes', () => {
    const { f, c, changed } = setup();
    c.loading.set(true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('.index-rows')).not.toBeNull();
    expect(f.nativeElement.querySelector('[role="status"]')).toBeNull();
    expect(f.nativeElement.querySelector('section').getAttribute('aria-busy')).toBe('true');
    const buttons = f.nativeElement.querySelectorAll('.filters button');
    for (const button of buttons) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    f.componentInstance.filter('architecture');
    expect(changed).not.toHaveBeenCalled();
    c.loading.set(false);
    f.detectChanges();
    buttons[1].click();
    expect(changed).toHaveBeenCalledOnce();
  });
  it('distinguishes an out-of-range page from an empty collection and can reset offset', () => {
    const { f, changed } = setup(page([], { total: 4, limit: 12, offset: 24 }));
    expect(f.nativeElement.textContent).toContain('No hay proyectos en esta página.');
    expect(f.nativeElement.textContent).not.toContain('Aún no se han publicado proyectos.');
    const button = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Volver a la primera página'))!;
    button.click();
    expect(changed).toHaveBeenLastCalledWith({ limit: 12, offset: 0, category: null, tag: null });
  });
  it('preserves Retry-After while hiding diagnostics', () => {
    const { f, c } = setup();
    c.error.set(new ApiError(429, 'private', [], '30', 'secret'));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Reintenta después de: 30');
    expect(f.nativeElement.textContent).not.toMatch(/private|secret/);
  });
  it('has no pointer-only preview by default or on touch', () => {
    const { f } = setup();
    f.componentInstance.move(
      { pointerType: 'touch', clientX: 100, clientY: 200 } as PointerEvent,
      card,
    );
    f.detectChanges();
    expect(f.nativeElement.querySelector('.floating-preview')).toBeNull();
  });
  it('pointer preview clamps within viewport and remains decorative', async () => {
    const { f } = setup();
    await f.whenStable();
    f.componentInstance.previewEnabled.set(true);
    f.componentInstance.move(
      { pointerType: 'mouse', clientX: 9999, clientY: 9999 } as PointerEvent,
      card,
    );
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    await f.whenStable();
    expect(f.componentInstance.point().x).toBeLessThanOrEqual(window.innerWidth - 320);
    expect(f.nativeElement.querySelector('.floating-preview')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
});
describe('Project preview/public delivery', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(publicRoutes)] }));
  it('uses real slug and thumbnail, with lazy loading and dimensions', () => {
    const f = TestBed.createComponent(ProjectPreview);
    f.componentRef.setInput('project', card);
    f.detectChanges();
    expect(f.nativeElement.querySelector('a').getAttribute('href')).toBe('/projects/' + card.slug);
    const img = f.nativeElement.querySelector('img');
    expect(img.src).toBe(card.cover!.thumbnail_url);
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('width')).toBe('1600');
  });
  it('missing cover is an explicit non-photographic fallback', () => {
    const f = TestBed.createComponent(ProjectPreview);
    f.componentRef.setInput('project', { ...card, cover: null });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sin imagen de portada');
    expect(f.nativeElement.querySelector('img')).toBeNull();
  });
  it('image failure falls back without refetch loops and recovers for a different asset', () => {
    const f = TestBed.createComponent(PublicCover);
    f.componentRef.setInput('media', card.cover);
    f.detectChanges();
    f.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Imagen no disponible');
    f.componentRef.setInput('media', {
      ...card.cover,
      url: 'https://delivery.example.test/new',
      thumbnail_url: null,
    });
    f.detectChanges();
    expect(f.nativeElement.querySelector('img').src).toBe('https://delivery.example.test/new');
  });
});
describe('Public project route state', () => {
  it('normalizes invalid offsets/limits and accepts only contract-compatible slug filters', () => {
    expect(
      projectQuery(
        convertToParamMap({ offset: '-2', limit: '101', category: 'bad slug', tag: 'built' }),
      ),
    ).toEqual({ offset: 0, limit: 12, category: undefined, tag: 'built' });
    expect(
      projectQuery(convertToParamMap({ offset: '24', limit: '6', category: 'architecture' })),
    ).toEqual({ offset: 24, limit: 6, category: 'architecture', tag: undefined });
  });
  it('loads /projects from query params and preserves Back navigation', async () => {
    const api = apiMock();
    TestBed.configureTestingModule({
      providers: [provideRouter(publicRoutes), { provide: PublicProjectsApi, useValue: api }],
    });
    const h = await RouterTestingHarness.create(
      '/projects?category=architecture&offset=12&limit=6',
    );
    expect(api.list).toHaveBeenLastCalledWith({
      category: 'architecture',
      tag: undefined,
      offset: 12,
      limit: 6,
    });
    const component = h.routeDebugElement!.componentInstance as PublicProjectsPage;
    component.navigate({ ...component.collection.query(), limit: 6, offset: 0, tag: 'built' });
    await h.fixture.whenStable();
    expect(TestBed.inject(Router).url).toContain('tag=built');
    expect(api.list).toHaveBeenLastCalledWith({
      category: 'architecture',
      tag: 'built',
      offset: 0,
      limit: 6,
    });
    await h.navigateByUrl('/projects?category=architecture&offset=12&limit=6');
    expect(api.list).toHaveBeenLastCalledWith({
      category: 'architecture',
      tag: undefined,
      offset: 12,
      limit: 6,
    });
  });
  it('slug destination loads the public detail without administrative components', async () => {
    const api = {
      ...apiMock(),
      detail: vi.fn(() => throwError(() => new ApiError(404, null, [], null, null))),
      nextProject: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter(publicRoutes), { provide: PublicProjectsApi, useValue: api }],
    });
    const h = await RouterTestingHarness.create('/projects/a-real-project');
    expect(h.routeNativeElement?.textContent).toContain('Proyecto no encontrado');
    expect(api.detail).toHaveBeenCalledWith('a-real-project');
    expect(api.list).not.toHaveBeenCalled();
    expect(api.featured).not.toHaveBeenCalled();
  });
});
