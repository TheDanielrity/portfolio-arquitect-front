import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { AuthApi } from './auth-api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthSession } from './auth-session.service';
import { AuthService } from './auth.service';

const base = 'https://api.test/api/v1';
const tokens = { access_token: 'old-access', refresh_token: 'o'.repeat(64), expires_in: 900 };
const rotated = { access_token: 'new-access', refresh_token: 'n'.repeat(64), expires_in: 900 };
const user = {
  id: 'id',
  email: 'admin@test.example',
  first_name: 'Admin',
  last_name: 'Test',
  is_active: true,
};
const unauthorized = { status: 401, statusText: 'Unauthorized' };

describe('Authentication state and single-flight refresh', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;
  let session: AuthSession;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: API_BASE_URL, useValue: base },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    session = TestBed.inject(AuthSession);
  });
  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });
  function seed(): void {
    session.save(tokens);
  }
  async function login(): Promise<void> {
    const result = firstValueFrom(auth.login({ email: user.email, password: 'secret' }));
    http.expectOne(base + '/auth/login').flush(tokens);
    const me = http.expectOne(base + '/auth/me');
    expect(me.request.headers.get('Authorization')).toBe('Bearer old-access');
    me.flush(user);
    await result;
  }
  it('starts unknown and does not authenticate because a token exists', () => {
    seed();
    expect(auth.status()).toBe('unknown');
    expect(auth.user()).toBeNull();
  });
  it('initializes an empty session without HTTP', async () => {
    expect(await firstValueFrom(auth.initialize())).toBe(false);
    expect(auth.status()).toBe('unauthenticated');
    http.expectNone(() => true);
  });
  it('logs in only after /me confirms the active user', async () => {
    await login();
    expect(auth.status()).toBe('authenticated');
    expect(auth.user()).toEqual(user);
  });
  it('restores a stored session through one rotation and /me shared by initializers', async () => {
    seed();
    const a = firstValueFrom(auth.initialize());
    const b = firstValueFrom(auth.initialize());
    http.expectOne(base + '/auth/refresh').flush(rotated);
    http.expectOne(base + '/auth/me').flush(user);
    expect(await Promise.all([a, b])).toEqual([true, true]);
    expect(await firstValueFrom(auth.initialize())).toBe(true);
    expect(session.refreshToken).toBe(rotated.refresh_token);
  });
  it('clears invalid initialization', async () => {
    seed();
    const result = firstValueFrom(auth.initialize());
    http.expectOne(base + '/auth/refresh').flush({}, unauthorized);
    expect(await result).toBe(false);
    expect(auth.status()).toBe('unauthenticated');
    expect(session.refreshToken).toBeNull();
  });
  it('attaches credentials only to protected backend endpoints', async () => {
    seed();
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    const request = http.expectOne(base + '/admin/projects');
    expect(request.request.headers.get('Authorization')).toBe('Bearer old-access');
    request.flush({});
    await result;
  });
  for (const url of [
    base + '/health',
    base + '/public/projects',
    'https://bucket.r2.cloudflarestorage.com/object?X-Amz-Signature=signed',
    'https://api.test.evil/api/v1/admin/projects',
    'https://api.test/api/v10/admin/projects',
    'https://api.test/other/admin/projects',
    'https://api.test/api/v1/public/../public/projects',
  ]) {
    it('does not send tokens to ' + url, async () => {
      seed();
      const result = firstValueFrom(client.get(url));
      const request = http.expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      await result;
    });
  }
  it('does not refresh a protected request that had no access token', async () => {
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    const request = http.expectOne(base + '/admin/projects');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({}, unauthorized);
    await assertion;
    http.expectNone(base + '/auth/refresh');
  });
  it('refreshes a 401 once, retries with new access and uses only the rotated refresh next time', async () => {
    seed();
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    http.expectOne(base + '/admin/projects').flush({}, unauthorized);
    const refresh = http.expectOne(base + '/auth/refresh');
    expect(refresh.request.body).toEqual({ refresh_token: tokens.refresh_token });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(rotated);
    const retry = http.expectOne(base + '/admin/projects');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
    const next = firstValueFrom(auth.refresh());
    const second = http.expectOne(base + '/auth/refresh');
    expect(second.request.body).toEqual({ refresh_token: rotated.refresh_token });
    second.flush({ ...rotated, access_token: 'third-access', refresh_token: 't'.repeat(64) });
    await next;
  });
  it('THREE concurrent 401s make EXACTLY ONE refresh and all retry with rotated credentials', async () => {
    seed();
    const urls = ['a', 'b', 'c'].map((id) => base + '/admin/' + id);
    const results = urls.map((url) => firstValueFrom(client.get(url)));
    for (const url of urls) http.expectOne(url).flush({}, unauthorized);
    const refreshes = http.match(base + '/auth/refresh');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0].request.body).toEqual({ refresh_token: tokens.refresh_token });
    refreshes[0].flush(rotated);
    for (const url of urls) {
      const retry = http.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access');
      retry.flush({ ok: true });
    }
    expect(await Promise.all(results)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(session.refreshToken).toBe(rotated.refresh_token);
    http.expectNone(base + '/auth/refresh');
  });
  it('a delayed old-access 401 uses already rotated access without a second refresh', async () => {
    seed();
    const a = firstValueFrom(client.get(base + '/admin/a'));
    const b = firstValueFrom(client.get(base + '/admin/b'));
    const oldB = http.expectOne(base + '/admin/b');
    http.expectOne(base + '/admin/a').flush({}, unauthorized);
    http.expectOne(base + '/auth/refresh').flush(rotated);
    http.expectOne(base + '/admin/a').flush({});
    oldB.flush({}, unauthorized);
    const retry = http.expectOne(base + '/admin/b');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-access');
    retry.flush({});
    await Promise.all([a, b]);
    http.expectNone(base + '/auth/refresh');
  });

  it('never retries an old session request with credentials from a later login', async () => {
    seed();
    const result = firstValueFrom(client.post(base + '/admin/projects', { title: 'Old session' }));
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    const oldRequest = http.expectOne(base + '/admin/projects');
    await login();
    oldRequest.flush({}, unauthorized);
    await assertion;
    http.expectNone(base + '/admin/projects');
    http.expectNone(base + '/auth/refresh');
    expect(auth.status()).toBe('authenticated');
    expect(session.accessToken).toBe(tokens.access_token);
  });

  it.each([tokens, rotated])(
    'a late retry 401 cannot expire a later login (%j)',
    async (replacement) => {
      seed();
      const result = firstValueFrom(client.get(base + '/admin/projects'));
      const assertion = expect(result).rejects.toMatchObject({ status: 401 });
      http.expectOne(base + '/admin/projects').flush({}, unauthorized);
      http.expectOne(base + '/auth/refresh').flush(replacement);
      const retry = http.expectOne(base + '/admin/projects');
      await login();
      retry.flush({}, unauthorized);
      await assertion;
      expect(auth.status()).toBe('authenticated');
      expect(auth.user()).toEqual(user);
      expect(session.refreshToken).toBe(tokens.refresh_token);
      expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
    },
  );

  it('a late retry 401 cannot expire credentials from a newer rotation', async () => {
    seed();
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    http.expectOne(base + '/admin/projects').flush({}, unauthorized);
    http.expectOne(base + '/auth/refresh').flush(rotated);
    const retry = http.expectOne(base + '/admin/projects');
    const refresh = firstValueFrom(auth.refresh());
    const latest = { ...rotated, access_token: 'latest-access', refresh_token: 'l'.repeat(64) };
    http.expectOne(base + '/auth/refresh').flush(latest);
    await refresh;
    retry.flush({}, unauthorized);
    await assertion;
    expect(session.accessToken).toBe(latest.access_token);
    expect(session.refreshToken).toBe(latest.refresh_token);
  });
  it('refresh 401 fails all waiters, clears session and never recurses', async () => {
    seed();
    const results = ['a', 'b', 'c'].map((id) => firstValueFrom(client.get(base + '/admin/' + id)));
    const assertions = results.map((result) =>
      expect(result).rejects.toMatchObject({ status: 401 }),
    );
    for (const id of ['a', 'b', 'c']) http.expectOne(base + '/admin/' + id).flush({}, unauthorized);
    http.expectOne(base + '/auth/refresh').flush({}, unauthorized);
    await Promise.all(assertions);
    expect(auth.status()).toBe('unauthenticated');
    expect(auth.user()).toBeNull();
    expect(session.accessToken).toBeNull();
    expect(session.refreshToken).toBeNull();
    http.expectNone(base + '/auth/refresh');
  });
  it('a retried 401 terminates the session without a refresh loop', async () => {
    seed();
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    const assertion = expect(result).rejects.toMatchObject({ status: 401 });
    http.expectOne(base + '/admin/projects').flush({}, unauthorized);
    http.expectOne(base + '/auth/refresh').flush(rotated);
    http.expectOne(base + '/admin/projects').flush({}, unauthorized);
    await assertion;
    expect(session.refreshToken).toBeNull();
    http.expectNone(base + '/auth/refresh');
  });
  for (const endpoint of ['login', 'refresh', 'logout'] as const) {
    it(endpoint + ' 401 does not trigger automatic refresh', async () => {
      seed();
      const api = TestBed.inject(AuthApi);
      const result = firstValueFrom<unknown>(
        endpoint === 'login'
          ? api.login({ email: 'a', password: 'b' })
          : endpoint === 'refresh'
            ? api.refresh({ refresh_token: tokens.refresh_token })
            : api.logout({ refresh_token: tokens.refresh_token }),
      );
      const assertion = expect(result).rejects.toMatchObject({ status: 401 });
      const request = http.expectOne(base + '/auth/' + endpoint);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({}, unauthorized);
      await assertion;
      http.expectNone(base + '/auth/refresh');
    });
  }
  it('403 does not rotate or clear a valid session', async () => {
    seed();
    const result = firstValueFrom(client.get(base + '/admin/projects'));
    const assertion = expect(result).rejects.toMatchObject({ status: 403 });
    http.expectOne(base + '/admin/projects').flush({}, { status: 403, statusText: 'Forbidden' });
    await assertion;
    expect(session.refreshToken).toBe(tokens.refresh_token);
    http.expectNone(base + '/auth/refresh');
  });
  it('logout clears local state even when remote revocation fails', async () => {
    await login();
    const result = firstValueFrom(auth.logout());
    const request = http.expectOne(base + '/auth/logout');
    expect(request.request.body).toEqual({ refresh_token: tokens.refresh_token });
    expect(auth.status()).toBe('unauthenticated');
    request.error(new ProgressEvent('error'));
    await result;
    expect(session.refreshToken).toBeNull();
  });
  it('logout waits for rotation and revokes the replacement session', async () => {
    seed();
    const refresh = firstValueFrom(auth.refresh());
    const logout = firstValueFrom(auth.logout());
    http.expectNone(base + '/auth/logout');
    http.expectOne(base + '/auth/refresh').flush(rotated);
    const request = http.expectOne(base + '/auth/logout');
    expect(request.request.body).toEqual({ refresh_token: rotated.refresh_token });
    request.flush(null, { status: 204, statusText: 'No Content' });
    await Promise.all([refresh, logout]);
    expect(session.refreshToken).toBeNull();
    expect(auth.status()).toBe('unauthenticated');
  });
  it('a stale /me response cannot restore the session after logout', async () => {
    seed();
    const init = firstValueFrom(auth.initialize());
    http.expectOne(base + '/auth/refresh').flush(rotated);
    const me = http.expectOne(base + '/auth/me');
    const logout = firstValueFrom(auth.logout());
    http.expectOne(base + '/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    me.flush(user);
    expect(await init).toBe(false);
    expect(auth.status()).toBe('unauthenticated');
    expect(auth.user()).toBeNull();
  });
  it('SSR never reads browser storage or makes authentication HTTP requests', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const serverAuth = TestBed.inject(AuthService);
    expect(await firstValueFrom(serverAuth.initialize())).toBe(false);
    expect(TestBed.inject(AuthSession).isBrowser).toBe(false);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('stale initialization cannot clear a newly authenticated session', async () => {
    seed();
    const initialization = firstValueFrom(auth.initialize());
    http.expectOne(base + '/auth/refresh').flush(rotated);
    const oldMe = http.expectOne(base + '/auth/me');
    await login();
    oldMe.flush(user);
    expect(await initialization).toBe(false);
    expect(auth.status()).toBe('authenticated');
    expect(session.accessToken).toBe(tokens.access_token);
  });

  it('a remote logout completion cannot erase a later login', async () => {
    await login();
    const logout = firstValueFrom(auth.logout());
    const remote = http.expectOne(base + '/auth/logout');
    await login();
    remote.flush(null, { status: 204, statusText: 'No Content' });
    await logout;
    expect(auth.status()).toBe('authenticated');
    expect(session.refreshToken).toBe(tokens.refresh_token);
  });

  it('rejects an inactive /me user and clears the session', async () => {
    const loginResult = firstValueFrom(auth.login({ email: user.email, password: 'secret' }));
    const assertion = expect(loginResult).rejects.toThrow('Session unavailable');
    http.expectOne(base + '/auth/login').flush(tokens);
    http.expectOne(base + '/auth/me').flush({ ...user, is_active: false });
    await assertion;
    expect(auth.status()).toBe('unauthenticated');
    expect(session.refreshToken).toBeNull();
  });
});
