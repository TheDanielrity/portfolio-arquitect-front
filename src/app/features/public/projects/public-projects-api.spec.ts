import { TestBed } from '@angular/core/testing';
import { makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { ApiError } from '../../../core/api/api-error';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthSession } from '../../../core/auth/auth-session.service';
import { PublicProjectsApi } from './public-projects-api';
import { page, category } from './public-projects.testing';
import { firstValueFrom } from 'rxjs';
const base = 'https://api.example.test/api/v1';
describe('PublicProjectsApi', () => {
  let http: HttpTestingController, api: PublicProjectsApi;
  const refresh = vi.fn();
  beforeEach(() => {
    refresh.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: base },
        {
          provide: AuthSession,
          useValue: { accessToken: 'admin-access', refreshToken: 'admin-refresh' },
        },
        { provide: AuthService, useValue: { refresh } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PublicProjectsApi);
  });
  afterEach(() => http.verify());
  it('hydrates detail exactly once and refreshes on subsequent navigation', async () => {
    const state = TestBed.inject(TransferState);
    const project = { ...page().items[0], sections: [] };
    const key = makeStateKey<typeof project>(
      'public-projects:' + base + '/public/projects/a-real-project?',
    );
    state.set(key, project);
    expect((await firstValueFrom(api.detail('a-real-project'))).slug).toBe('a-real-project');
    http.expectNone(() => true);
    expect(state.hasKey(key)).toBe(false);
    const fresh = firstValueFrom(api.detail('a-real-project'));
    http.expectOne(base + '/public/projects/a-real-project').flush(project);
    await fresh;
  });
  it('a detail 401 never triggers administrator refresh', async () => {
    const result = firstValueFrom(api.detail('a-real-project'));
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    http
      .expectOne(base + '/public/projects/a-real-project')
      .flush({ detail: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await assertion;
    expect(refresh).not.toHaveBeenCalled();
  });
  it('loads detail by encoded slug without Authorization or credentials', async () => {
    const result = firstValueFrom(api.detail('a-real-project'));
    const req = http.expectOne(base + '/public/projects/a-real-project');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    req.flush({ ...page().items[0], sections: [] });
    expect((await result).sections).toEqual([]);
  });
  it('selects a successor across public pages and wraps without selecting the current project', async () => {
    const result = firstValueFrom(api.nextProject('last-project'));
    const first = page().items[0];
    http
      .expectOne(base + '/public/projects?limit=100&offset=0')
      .flush(page([first], { limit: 100, total: 101 }));
    http
      .expectOne(base + '/public/projects?limit=100&offset=100')
      .flush(page([{ ...first, slug: 'last-project' }], { limit: 100, offset: 100, total: 101 }));
    expect((await result)?.slug).toBe(first.slug);
  });
  it('omits next project when the current one is the sole listed project', async () => {
    const result = firstValueFrom(api.nextProject('a-real-project'));
    http.expectOne(base + '/public/projects?limit=100&offset=0').flush(page());
    expect(await result).toBeNull();
  });
  it('chooses the first discoverable project for an UNLISTED direct view', async () => {
    const result = firstValueFrom(api.nextProject('unlisted-project'));
    http.expectOne(base + '/public/projects?limit=100&offset=0').flush(page());
    expect((await result)?.slug).toBe('a-real-project');
  });
  it('uses only the public list URL and exact category/tag/limit/offset parameters', async () => {
    const promise = firstValueFrom(
      api.list({ limit: 4, offset: 8, category: 'architecture', tag: 'built' }),
    );
    const req = http.expectOne((r) => r.url === base + '/public/projects');
    expect(req.request.params.keys()).toEqual(['limit', 'offset', 'category', 'tag']);
    expect(req.request.params.get('offset')).toBe('8');
    expect(req.request.params.get('category')).toBe('architecture');
    expect(req.request.params.get('tag')).toBe('built');
    req.flush(page());
    expect((await promise).items[0].slug).toBe('a-real-project');
  });
  it('omits empty optional filters and adds no invented search or year', () => {
    api.list({ category: null, tag: '', limit: 12 }).subscribe();
    const req = http.expectOne(base + '/public/projects?limit=12');
    expect(req.request.params.keys()).toEqual(['limit']);
    req.flush(page());
  });
  it('gets featured through its own public endpoint, not a fabricated boolean filter', async () => {
    const result = firstValueFrom(api.featured({ limit: 1, offset: 0 }));
    const req = http.expectOne(base + '/public/featured-projects?limit=1&offset=0');
    req.flush(page());
    expect((await result).total).toBe(1);
  });
  it('gets paginated public categories', async () => {
    const result = firstValueFrom(api.categories(20, 40));
    http
      .expectOne(base + '/public/categories?limit=20&offset=40')
      .flush({ items: [category], limit: 20, offset: 40, total: 41 });
    expect((await result).items).toEqual([category]);
  });
  it('does not silently truncate category choices after the first page', async () => {
    const result = firstValueFrom(api.categoryOptions());
    http
      .expectOne(base + '/public/categories?limit=100&offset=0')
      .flush({ items: [category], limit: 100, offset: 0, total: 101 });
    http
      .expectOne(base + '/public/categories?limit=100&offset=100')
      .flush({ items: [{ ...category, slug: 'interiors' }], limit: 100, offset: 100, total: 101 });
    expect(await result).toHaveLength(2);
  });
  it('preserves public cover delivery fields without storage identity', async () => {
    const result = firstValueFrom(api.list());
    http.expectOne(base + '/public/projects').flush(page());
    expect((await result).items[0].cover?.thumbnail_url).toBe(
      'https://delivery.example.test/public/thumbnail',
    );
  });
  it('never sends Authorization even with an administrator session', () => {
    api.list().subscribe();
    const req = http.expectOne(base + '/public/projects');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    req.flush(page());
  });
  it('a public 401 never refreshes authentication', async () => {
    const result = firstValueFrom(api.list());
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    http
      .expectOne(base + '/public/projects')
      .flush({ detail: 'Unavailable' }, { status: 401, statusText: 'Unauthorized' });
    await assertion;
    expect(refresh).not.toHaveBeenCalled();
  });
  it('normalizes errors and retains Retry-After privately for UI', async () => {
    const result = firstValueFrom(api.list());
    const assertion = expect(result).rejects.toMatchObject({
      status: 429,
      retryAfter: '30',
      errorId: 'diagnostic',
    });
    http.expectOne(base + '/public/projects').flush(
      { detail: 'Rate limited' },
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'Retry-After': '30', 'X-Error-ID': 'diagnostic' },
      },
    );
    await assertion;
  });
  it('consumes transferred SSR data once, then requests fresh data', async () => {
    const key = makeStateKey<ReturnType<typeof page>>(
      'public-projects:' + base + '/public/projects?limit=12',
    );
    const state = TestBed.inject(TransferState);
    state.set(key, page());
    expect((await firstValueFrom(api.list({ limit: 12 }))).items).toHaveLength(1);
    http.expectNone(() => true);
    expect(state.hasKey(key)).toBe(false);
    const result = firstValueFrom(api.list({ limit: 12 }));
    http.expectOne(base + '/public/projects?limit=12').flush(page([]));
    expect((await result).items).toHaveLength(0);
  });
  it('server snapshots public data per request, without a persistent HTTP cache', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: base },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PublicProjectsApi);
    const result = firstValueFrom(api.list({ limit: 12 }));
    const req = http.expectOne(base + '/public/projects?limit=12');
    expect(req.request.transferCache).toBe(false);
    req.flush(page());
    await result;
    expect(
      TestBed.inject(TransferState).hasKey(
        makeStateKey('public-projects:' + base + '/public/projects?limit=12'),
      ),
    ).toBe(true);
  });
  it('does not expose the raw backend error through an alternate parser', async () => {
    const result = firstValueFrom(api.list());
    const assertion = expect(result).rejects.toBeInstanceOf(ApiError);
    http
      .expectOne(base + '/public/projects')
      .flush({ detail: 'Internal server error' }, { status: 500, statusText: 'Error' });
    await assertion;
  });
  it('hydrates a safe SSR error once without repeating the request or exposing detail', async () => {
    const state = TestBed.inject(TransferState);
    const key = makeStateKey<{ status: number; retryAfter: string | null }>(
      'public-project-error:' + base + '/public/projects?limit=12',
    );
    state.set(key, { status: 429, retryAfter: '20' });
    await expect(firstValueFrom(api.list({ limit: 12 }))).rejects.toMatchObject({
      status: 429,
      detail: null,
      retryAfter: '20',
      errorId: null,
    });
    http.expectNone(() => true);
    expect(state.hasKey(key)).toBe(false);
  });
  it('server error snapshots exclude backend detail and diagnostic identifiers', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: base },
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PublicProjectsApi);
    const result = firstValueFrom(api.list());
    const assertion = expect(result).rejects.toMatchObject({ status: 500 });
    http
      .expectOne(base + '/public/projects')
      .flush(
        { detail: 'private trace' },
        { status: 500, statusText: 'Error', headers: { 'X-Error-ID': 'private-id' } },
      );
    await assertion;
    const snapshot = TestBed.inject(TransferState).toJson();
    expect(snapshot).not.toMatch(/private trace|private-id/);
    expect(snapshot).toContain('"status":500');
  });
});
