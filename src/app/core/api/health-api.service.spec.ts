import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { ApiError } from './api-error';
import { HealthApi, type HealthResponse } from './health-api.service';
import type { ErrorResponse } from './generated/types.gen';

describe('HealthApi', () => {
  let http: HttpTestingController;
  let service: HealthApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.example.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HealthApi);
  });

  afterEach(() => http.verify());

  it('requests the configured health URL and returns the generated response contract', async () => {
    const response: HealthResponse = { status: 'ok' };
    const result = firstValueFrom(service.check());
    const request = http.expectOne({
      method: 'GET',
      url: 'https://api.example.test/api/v1/health',
    });
    expect(request.request.withCredentials).toBe(false);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(response);
    expect(await result).toEqual(response);
  });

  it('preserves a declared backend error and its diagnostic identifier', async () => {
    const response: ErrorResponse = { detail: 'Internal server error' };
    const result = firstValueFrom(service.check());
    const assertion = expect(result).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: response.detail,
      errorId: 'error-123',
    });
    http.expectOne('https://api.example.test/api/v1/health').flush(response, {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'X-Error-ID': 'error-123' },
    });
    await assertion;
  });

  it('represents network failures without exposing transport payloads', async () => {
    const result = firstValueFrom(service.check());
    const assertion = expect(result).rejects.toBeInstanceOf(ApiError);
    http.expectOne('https://api.example.test/api/v1/health').error(new ProgressEvent('error'));
    await assertion;
  });
});
