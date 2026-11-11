import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { ApiError } from '../../../core/api/api-error';
import { allPages, ProjectApi } from './project-api.service';
import { saveOrder } from './project-order';
describe('Project HTTP contracts', () => {
  let api: ProjectApi;
  let http: HttpTestingController;
  const base = 'https://api.test/api/v1/admin';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    });
    api = TestBed.inject(ProjectApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const cases: {
    name: string;
    call: (api: ProjectApi) => Observable<unknown>;
    method: string;
    path: string;
    body?: unknown;
  }[] = [
    { name: 'detail UUID', call: (a) => a.detail('p'), method: 'GET', path: '/projects/p' },
    {
      name: 'create',
      call: (a) => a.create({ title: 'Casa', slug: 'casa' }),
      method: 'POST',
      path: '/projects',
      body: { title: 'Casa', slug: 'casa' },
    },
    {
      name: 'update null and featured',
      call: (a) => a.update('p', { location: null, is_featured: true, status: 'ARCHIVED' }),
      method: 'PATCH',
      path: '/projects/p',
      body: { location: null, is_featured: true, status: 'ARCHIVED' },
    },
    { name: 'soft delete', call: (a) => a.delete('p'), method: 'DELETE', path: '/projects/p' },
    {
      name: 'create category',
      call: (a) => a.createCategory({ name: 'Casa', slug: 'casa' }),
      method: 'POST',
      path: '/categories',
      body: { name: 'Casa', slug: 'casa' },
    },
    {
      name: 'create tag',
      call: (a) => a.createTag({ name: 'Madera', slug: 'madera' }),
      method: 'POST',
      path: '/tags',
      body: { name: 'Madera', slug: 'madera' },
    },
    {
      name: 'assign categories',
      call: (a) => a.assign('p', 'categories', ['a']),
      method: 'PUT',
      path: '/projects/p/categories',
      body: { ids: ['a'] },
    },
    {
      name: 'remove tags',
      call: (a) => a.assign('p', 'tags', []),
      method: 'PUT',
      path: '/projects/p/tags',
      body: { ids: [] },
    },
    {
      name: 'add attribute',
      call: (a) => a.addAttribute('p', { label: 'Autor', value: 'Nombre', sort_order: 2 }),
      method: 'POST',
      path: '/projects/p/attributes',
      body: { label: 'Autor', value: 'Nombre', sort_order: 2 },
    },
    {
      name: 'edit attribute',
      call: (a) => a.updateAttribute('p', 'a', { value: 'Nuevo' }),
      method: 'PATCH',
      path: '/projects/p/attributes/a',
      body: { value: 'Nuevo' },
    },
    {
      name: 'delete attribute',
      call: (a) => a.deleteAttribute('p', 'a'),
      method: 'DELETE',
      path: '/projects/p/attributes/a',
    },
    {
      name: 'attach media with role',
      call: (a) => a.attach('p', { media_id: 'm', role: 'PLAN', sort_order: 3 }),
      method: 'POST',
      path: '/projects/p/media',
      body: { media_id: 'm', role: 'PLAN', sort_order: 3 },
    },
    {
      name: 'edit media role',
      call: (a) => a.updateMedia('p', 'r', { role: 'RENDER' }),
      method: 'PATCH',
      path: '/projects/p/media/r',
      body: { role: 'RENDER' },
    },
    {
      name: 'detach media',
      call: (a) => a.detach('p', 'r'),
      method: 'DELETE',
      path: '/projects/p/media/r',
    },
    {
      name: 'atomic cover replacement',
      call: (a) => a.cover('p', 'm'),
      method: 'PUT',
      path: '/projects/p/cover',
      body: { media_id: 'm' },
    },
    ...(['attributes', 'media'] as const).map((kind) => ({
      name: 'order ' + kind,
      call: (a: ProjectApi) => a.order('p', kind, { items: [{ id: 'a', sort_order: 0 }] }),
      method: 'PUT',
      path: '/projects/p/' + kind + '/order',
      body: { items: [{ id: 'a', sort_order: 0 }] },
    })),
  ];
  for (const c of cases)
    it(c.name, async () => {
      const result = firstValueFrom(c.call(api));
      const request = http.expectOne(base + c.path);
      expect(request.request.method).toBe(c.method);
      if (c.body) expect(request.request.body).toEqual(c.body);
      expect(request.request.transferCache).toBe(false);
      request.flush(
        c.method === 'DELETE' || (c.method === 'PUT' && c.path !== '/projects/p/cover')
          ? null
          : { id: 'id' },
      );
      await result;
    });
  it('lists with exact server filters and pagination', async () => {
    const result = firstValueFrom(
      api.list({
        limit: 20,
        offset: 40,
        q: 'Casa',
        status: 'DRAFT',
        visibility: 'UNLISTED',
        is_featured: false,
        category_id: 'c',
        tag_id: 't',
        sort: 'updated_at',
        direction: 'desc',
      }),
    );
    const r = http.expectOne((r) => r.url === base + '/projects');
    expect(
      Object.fromEntries(r.request.params.keys().map((k) => [k, r.request.params.get(k)])),
    ).toEqual({
      limit: '20',
      offset: '40',
      q: 'Casa',
      status: 'DRAFT',
      visibility: 'UNLISTED',
      is_featured: 'false',
      category_id: 'c',
      tag_id: 't',
      sort: 'updated_at',
      direction: 'desc',
    });
    r.flush({ items: [], total: 0, limit: 20, offset: 40 });
    await result;
  });
  for (const kind of ['categories', 'tags'] as const)
    it('loads global and assigned ' + kind, async () => {
      for (const project of [undefined, 'p']) {
        const result = firstValueFrom(api.taxons(kind, 100, project));
        const r = http.expectOne(
          (r) => r.url === base + (project ? '/projects/p' : '') + '/' + kind,
        );
        expect(r.request.params.get('offset')).toBe('100');
        r.flush({ items: [], total: 0, limit: 100, offset: 100 });
        await result;
      }
    });
  for (const kind of ['attributes', 'media'] as const)
    it('loads paginated ' + kind, async () => {
      const result = firstValueFrom<unknown>(api[kind]('p', 100));
      http
        .expectOne(
          (r) => r.url === base + '/projects/p/' + kind && r.params.get('offset') === '100',
        )
        .flush({ items: [], total: 0, limit: 100, offset: 100 });
      await result;
    });
  it('loads every taxonomy page without truncation', async () => {
    const result = firstValueFrom(allPages((o) => api.taxons('tags', o)));
    http
      .expectOne((r) => r.params.get('offset') === '0')
      .flush({ items: [{ id: 'a' }], limit: 100, offset: 0, total: 101 });
    http
      .expectOne((r) => r.params.get('offset') === '100')
      .flush({ items: [{ id: 'b' }], limit: 100, offset: 100, total: 101 });
    expect((await result).map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('persists final ordering in sequential batches within backend maxItems', async () => {
    const result = firstValueFrom(
      saveOrder(
        api,
        'p',
        'media',
        Array.from({ length: 101 }, (_, i) => ({ id: String(i) })),
      ),
    );
    const r = http.expectOne(base + '/projects/p/media/order');
    expect(r.request.body.items).toHaveLength(100);
    r.flush(null);
    const last = http.expectOne(base + '/projects/p/media/order');
    expect(last.request.body).toEqual({ items: [{ id: '100', sort_order: 100 }] });
    last.flush(null);
    await result;
  });
  it('preserves 409 and Retry-After through existing parsing', async () => {
    const result = firstValueFrom(api.cover('p', 'm'));
    http
      .expectOne(base + '/projects/p/cover')
      .flush(
        { detail: 'conflict' },
        { status: 409, statusText: 'Conflict', headers: { 'Retry-After': '3' } },
      );
    await expect(result).rejects.toMatchObject({
      status: 409,
      retryAfter: '3',
      name: 'ApiError',
    } satisfies Partial<ApiError>);
  });
});
