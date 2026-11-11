import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { AuthApi } from './auth-api.service';

describe('AuthApi contract', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  for (const endpoint of ['login', 'refresh', 'logout', 'me'] as const) {
    it('uses the generated ' + endpoint + ' contract and configured URL', async () => {
      const api = TestBed.inject(AuthApi);
      const body =
        endpoint === 'login'
          ? { email: 'admin@test.example', password: 'secret' }
          : { refresh_token: 'r'.repeat(64) };
      const response =
        endpoint === 'me'
          ? {
              id: 'user',
              email: 'admin@test.example',
              first_name: 'A',
              last_name: 'B',
              is_active: true,
            }
          : endpoint === 'logout'
            ? null
            : {
                access_token: 'jwt',
                refresh_token: 'r'.repeat(64),
                expires_in: 900,
                token_type: 'bearer',
              };
      const result = firstValueFrom<unknown>(
        endpoint === 'login'
          ? api.login(body as { email: string; password: string })
          : endpoint === 'refresh'
            ? api.refresh(body as { refresh_token: string })
            : endpoint === 'logout'
              ? api.logout(body as { refresh_token: string })
              : api.me(),
      );
      const request = TestBed.inject(HttpTestingController).expectOne(
        'https://api.test/api/v1/auth/' + endpoint,
      );
      expect(request.request.method).toBe(endpoint === 'me' ? 'GET' : 'POST');
      expect(request.request.body).toEqual(endpoint === 'me' ? null : body);
      expect(request.request.transferCache).toBe(false);
      request.flush(
        response,
        endpoint === 'logout' ? { status: 204, statusText: 'No Content' } : {},
      );
      expect(await result).toEqual(response);
    });
  }
  it('preserves validation, Retry-After and diagnostic data through Phase 1 parsing', async () => {
    const result = firstValueFrom(TestBed.inject(AuthApi).login({ email: 'a', password: 'b' }));
    const assertion = expect(result).rejects.toMatchObject({
      status: 429,
      retryAfter: '60',
      errorId: 'diagnostic',
    });
    TestBed.inject(HttpTestingController)
      .expectOne('https://api.test/api/v1/auth/login')
      .flush(
        { detail: 'Rate limit' },
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '60', 'X-Error-ID': 'diagnostic' },
        },
      );
    await assertion;
  });
});
