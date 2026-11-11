import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { ContentApi } from './content-api.service';
describe('Global content HTTP contracts', () => {
  let api: ContentApi;
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
    api = TestBed.inject(ContentApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const cases: {
    name: string;
    method: string;
    path: string;
    body?: unknown;
    run: (api: ContentApi) => Observable<unknown>;
  }[] = [
    { name: 'profile singleton GET', method: 'GET', path: '/profile', run: (a) => a.profile() },
    {
      name: 'profile create',
      method: 'POST',
      path: '/profile',
      body: { first_name: 'Ana', last_name: 'López' },
      run: (a) => a.createProfile({ first_name: 'Ana', last_name: 'López' }),
    },
    {
      name: 'profile update',
      method: 'PATCH',
      path: '/profile',
      body: { biography: null },
      run: (a) => a.updateProfile({ biography: null }),
    },
    ...(['profile_media_id', 'cv_media_id'] as const).flatMap((key) => [
      {
        name: key + ' assignment',
        method: 'PATCH',
        path: '/profile',
        body: { [key]: 'm' },
        run: (a: ContentApi) => a.updateProfile({ [key]: 'm' }),
      },
      {
        name: key + ' removal without asset DELETE',
        method: 'PATCH',
        path: '/profile',
        body: { [key]: null },
        run: (a: ContentApi) => a.updateProfile({ [key]: null }),
      },
    ]),
    {
      name: 'social detail',
      method: 'GET',
      path: '/profile/social-links/s',
      run: (a) => a.social('s'),
    },
    {
      name: 'social create',
      method: 'POST',
      path: '/profile/social-links',
      body: { platform: 'Custom', url: 'https://example.test' },
      run: (a) => a.createSocial({ platform: 'Custom', url: 'https://example.test' }),
    },
    {
      name: 'social update',
      method: 'PATCH',
      path: '/profile/social-links/s',
      body: { username: null, is_visible: false },
      run: (a) => a.updateSocial('s', { username: null, is_visible: false }),
    },
    {
      name: 'social delete',
      method: 'DELETE',
      path: '/profile/social-links/s',
      run: (a) => a.deleteSocial('s'),
    },
    {
      name: 'social order',
      method: 'PUT',
      path: '/profile/social-links/order',
      body: { items: [{ id: 's', sort_order: 1 }] },
      run: (a) => a.orderSocials({ items: [{ id: 's', sort_order: 1 }] }),
    },
    { name: 'service detail', method: 'GET', path: '/services/s', run: (a) => a.service('s') },
    {
      name: 'service create',
      method: 'POST',
      path: '/services',
      body: { name: 'Diseño', slug: 'diseno' },
      run: (a) => a.createService({ name: 'Diseño', slug: 'diseno' }),
    },
    {
      name: 'service update',
      method: 'PATCH',
      path: '/services/s',
      body: { icon: null, is_visible: false },
      run: (a) => a.updateService('s', { icon: null, is_visible: false }),
    },
    {
      name: 'service delete',
      method: 'DELETE',
      path: '/services/s',
      run: (a) => a.deleteService('s'),
    },
    {
      name: 'service order',
      method: 'PUT',
      path: '/services/order',
      body: { items: [{ id: 's', sort_order: 1 }] },
      run: (a) => a.orderServices({ items: [{ id: 's', sort_order: 1 }] }),
    },
    { name: 'settings list', method: 'GET', path: '/site-settings', run: (a) => a.settings() },
    {
      name: 'setting detail',
      method: 'GET',
      path: '/site-settings/site_title',
      run: (a) => a.setting('site_title'),
    },
    {
      name: 'one setting PUT',
      method: 'PUT',
      path: '/site-settings/site_title',
      body: { value: 'Portfolio' },
      run: (a) => a.putSetting('site_title', { value: 'Portfolio' }),
    },
    {
      name: 'boolean setting PUT',
      method: 'PUT',
      path: '/site-settings/contact_enabled',
      body: { value: false },
      run: (a) => a.putSetting('contact_enabled', { value: false }),
    },
  ];
  for (const c of cases)
    it(c.name, () => {
      c.run(api).subscribe();
      const r = http.expectOne(base + c.path);
      expect(r.request.method).toBe(c.method);
      if (c.body) expect(r.request.body).toEqual(c.body);
      expect(r.request.transferCache).toBe(false);
      r.flush(c.method === 'DELETE' ? null : {});
      http.expectNone((req) => req.url.includes('/media/') || req.url.includes('r2'));
    });
  for (const social of [true, false])
    it('paginated ' + (social ? 'socials' : 'services'), () => {
      const request: Observable<unknown> = social ? api.socials(100) : api.services(100);
      request.subscribe();
      const r = http.expectOne(
        (req) => req.url === base + (social ? '/profile/social-links' : '/services'),
      );
      expect(r.request.params.get('limit')).toBe('100');
      expect(r.request.params.get('offset')).toBe('100');
      expect(r.request.params.get('sort')).toBe('sort_order');
      r.flush({ items: [], total: 0, limit: 100, offset: 100 });
    });
});
