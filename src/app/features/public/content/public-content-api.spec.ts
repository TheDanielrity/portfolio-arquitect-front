import { TestBed } from '@angular/core/testing';
import { makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, Observable } from 'rxjs';
import type { PublicService, PublicSocialLink } from '../../../core/api/generated/types.gen';
import { API_BASE_URL } from '../../../core/api/api-config';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthSession } from '../../../core/auth/auth-session.service';
import { PublicContentApi } from './public-content-api';
import { profileFixture } from './public-content.testing';
const base = 'https://api.example.test/api/v1/public';
describe('Public content contracts', () => {
  let http: HttpTestingController;
  let api: PublicContentApi;
  const refresh = vi.fn();
  beforeEach(() => {
    refresh.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api/v1' },
        {
          provide: AuthSession,
          useValue: { accessToken: 'admin-access', refreshToken: 'admin-refresh' },
        },
        { provide: AuthService, useValue: { refresh } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PublicContentApi);
  });
  afterEach(() => http.verify());
  for (const path of ['profile', 'settings', 'services', 'socialLinks'] as const) {
    it('reads ' + path + ' anonymously even with an administrator session', () => {
      const read: Observable<unknown> = api[path]();
      read.subscribe();
      const endpoint = {
        profile: '/profile',
        settings: '/site-settings',
        services: '/services',
        socialLinks: '/social-links',
      }[path];
      const request = http.expectOne((req) => req.url === base + endpoint);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(request.request.withCredentials).toBe(false);
      expect(request.request.method).toBe('GET');
      request.flush(
        path === 'profile'
          ? profileFixture
          : path === 'settings'
            ? []
            : { items: [], total: 0, limit: 100, offset: 0 },
      );
    });
  }
  for (const type of ['allServices', 'allSocialLinks'] as const) {
    it('preserves backend order across all pages of ' + type, async () => {
      const endpoint = type === 'allServices' ? '/services' : '/social-links';
      const read: Observable<PublicService[] | PublicSocialLink[]> = api[type]();
      const result = firstValueFrom(read);
      http.expectOne(base + endpoint + '?limit=100&offset=0').flush({
        items: [{ name: 'First', slug: 'first', platform: 'First', url: 'https://first.test' }],
        total: 101,
        limit: 100,
        offset: 0,
      });
      http.expectOne(base + endpoint + '?limit=100&offset=100').flush({
        items: [{ name: 'Last', slug: 'last', platform: 'Last', url: 'https://last.test' }],
        total: 101,
        limit: 100,
        offset: 100,
      });
      expect((await result).map((item) => ('name' in item ? item.name : item.platform))).toEqual([
        'First',
        'Last',
      ]);
    });
  }
  it('posts only accepted fields with no Authorization, credentials or transfer cache', async () => {
    const body = {
      name: 'Synthetic',
      email: 'test@example.test',
      phone: null,
      subject: null,
      message: 'Synthetic message',
    };
    const result = firstValueFrom(api.contact(body));
    const request = http.expectOne(base + '/contact');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.transferCache).toBe(false);
    request.flush({ detail: 'Message received' });
    expect(await result).toEqual({ detail: 'Message received' });
  });
  it('never refreshes a public contact 401', async () => {
    const result = firstValueFrom(
      api.contact({ name: 'Test', email: 'a@example.test', message: 'Test' }),
    );
    const rejection = expect(result).rejects.toMatchObject({ status: 401 });
    http.expectOne(base + '/contact').flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejection;
    expect(refresh).not.toHaveBeenCalled();
  });
  it('consumes the SSR profile snapshot once before fetching fresh data', async () => {
    const key = makeStateKey<typeof profileFixture>('public-projects:' + base + '/profile?');
    TestBed.inject(TransferState).set(key, profileFixture);
    expect(await firstValueFrom(api.profile())).toEqual(profileFixture);
    http.expectNone(() => true);
    expect(TestBed.inject(TransferState).hasKey(key)).toBe(false);
    const result = firstValueFrom(api.profile());
    http.expectOne(base + '/profile').flush(profileFixture);
    await result;
  });
  it('transfers actual public content during SSR and safe errors without internal details', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(PublicContentApi);
    api.profile().subscribe();
    http.expectOne(base + '/profile').flush(profileFixture);
    expect(
      TestBed.inject(TransferState).get(
        makeStateKey('public-projects:' + base + '/profile?'),
        null,
      ),
    ).toEqual(profileFixture);
    api.settings().subscribe({ error: () => undefined });
    http
      .expectOne(base + '/site-settings')
      .flush({ detail: 'private diagnostic' }, { status: 500, statusText: 'Error' });
    expect(TestBed.inject(TransferState).toJson()).not.toContain('private diagnostic');
  });
});
