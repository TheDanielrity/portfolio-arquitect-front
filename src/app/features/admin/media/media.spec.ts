import {
  HttpClient,
  HttpBackend,
  HttpEventType,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { ApiError } from '../../../core/api/api-error';
import { AuthSession } from '../../../core/auth/auth-session.service';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { MediaApi, MEDIA_UPLOAD_BACKEND } from './media-api.service';
import { MediaUpload } from './media-upload.service';
import { validateFile } from './media-policy';
import { mediaError } from './media-errors';
import type { MediaResponse, UploadResponse } from '../../../core/api/generated/types.gen';
const base = 'https://api.test/api/v1';
export const media: MediaResponse = {
  id: 'asset',
  type: 'IMAGE',
  original_filename: 'test.png',
  storage_provider: 'r2',
  storage_key: 'not-for-ui',
  url: 'https://api.test/api/v1/public/media/asset/content',
  thumbnail_url: null,
  mime_type: 'image/png',
  file_size: 3,
  width: null,
  height: null,
  title: null,
  alt_text: null,
  description: null,
  metadata: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
};
const authorization: UploadResponse = {
  upload_id: 'upload',
  upload_url: 'https://bucket.r2.cloudflarestorage.com/staging/test?signature=test',
  method: 'PUT',
  headers: { 'Content-Type': 'image/png', 'x-amz-meta-test': 'signed' },
  expires_at: '2099-01-01T00:00:00Z',
  max_file_size: 20971520,
  provider: 'r2',
};
const file = () => new File(['png'], 'test.png', { type: 'image/png' });
describe('Media API and upload contract', () => {
  let http: HttpTestingController;
  let api: MediaApi;
  let upload: MediaUpload;
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: MEDIA_UPLOAD_BACKEND, useExisting: HttpBackend },
        provideRouter([]),
        { provide: API_BASE_URL, useValue: base },
        MediaUpload,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(MediaApi);
    upload = TestBed.inject(MediaUpload);
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    sessionStorage.clear();
  });
  function start(): void {
    upload.select(file());
    upload.start();
    http.expectOne(base + '/admin/media/uploads/presign').flush(authorization);
  }
  function transferred(): void {
    start();
    http.expectOne(authorization.upload_url).flush(null);
  }
  it('lists with exact pagination, supported filters and sort', async () => {
    const result = firstValueFrom(
      api.list({
        limit: 12,
        offset: 24,
        type: 'IMAGE',
        q: 'plan',
        sort: 'file_size',
        direction: 'asc',
      }),
    );
    const req = http.expectOne((r) => r.url === base + '/admin/media');
    expect(req.request.params.keys()).toEqual([
      'limit',
      'offset',
      'type',
      'q',
      'sort',
      'direction',
    ]);
    expect(req.request.params.get('offset')).toBe('24');
    expect(req.request.params.get('q')).toBe('plan');
    req.flush({ items: [media], total: 25, limit: 12, offset: 24 });
    expect((await result).items).toEqual([media]);
  });
  it('gets detail and updates only permitted metadata', async () => {
    const detail = firstValueFrom(api.detail('asset'));
    http.expectOne(base + '/admin/media/asset').flush(media);
    expect(await detail).toEqual(media);
    const update = firstValueFrom(
      api.update('asset', { title: 'Plan', description: null, alt_text: 'Plano' }),
    );
    const req = http.expectOne(base + '/admin/media/asset');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ title: 'Plan', description: null, alt_text: 'Plano' });
    req.flush({ ...media, title: 'Plan' });
    expect((await update).title).toBe('Plan');
  });
  it('deletes and tolerates repeated managed DELETE 204', async () => {
    for (let i = 0; i < 2; i++) {
      const result = firstValueFrom(api.delete('asset'));
      const req = http.expectOne(base + '/admin/media/asset');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      await result;
    }
  });
  it('preserves reference conflict, Retry-After and diagnostics', async () => {
    const result = firstValueFrom(api.delete('asset'));
    const assertion = expect(result).rejects.toMatchObject({
      status: 409,
      detail: 'Media asset is still referenced',
      retryAfter: '30',
      errorId: 'diagnostic',
    });
    http.expectOne(base + '/admin/media/asset').flush(
      { detail: 'Media asset is still referenced' },
      {
        status: 409,
        statusText: 'Conflict',
        headers: { 'Retry-After': '30', 'X-Error-ID': 'diagnostic' },
      },
    );
    await assertion;
  });
  it('uses authenticated content endpoint as Blob without storing signed GET URLs', async () => {
    const result = firstValueFrom(api.content('asset'));
    const req = http.expectOne(base + '/admin/media/asset/content');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['image']));
    expect((await result).size).toBe(5);
  });
  it('validates a file and sends the exact presign body', () => {
    upload.select(file());
    expect(upload.stage()).toBe('selected');
    upload.start();
    const req = http.expectOne(base + '/admin/media/uploads/presign');
    expect(req.request.body).toEqual({
      original_filename: 'test.png',
      mime_type: 'image/png',
      file_size: 3,
      access: 'private',
    });
    req.flush(authorization);
    http.expectOne(authorization.upload_url).flush(null);
    const confirm = http.expectOne(base + '/admin/media/uploads/confirm');
    expect(confirm.request.body).toEqual({ upload_id: 'upload' });
    confirm.flush(media);
    expect(upload.asset()).toEqual(media);
    expect(upload.stage()).toBe('completed');
  });
  it('rejects unsupported GLTF, mismatched MIME, empty and oversized files before HTTP', () => {
    for (const invalid of [
      new File(['x'], 'test.gltf', { type: 'model/gltf+json' }),
      new File(['x'], 'test.png', { type: 'text/plain' }),
      new File([], 'test.png', { type: 'image/png' }),
      new File(['x'.repeat(20971521)], 'test.png', { type: 'image/png' }),
    ]) {
      upload.select(invalid);
      expect(upload.stage()).toBe('failed');
      upload.start();
    }
    http.expectNone(() => true);
  });
  it('derives blank browser MIME from supported extension for GLB', () => {
    expect(validateFile(new File(['glTF'], 'test.glb')).mime_type).toBe('model/gltf-binary');
  });
  it('PUT uses the returned URL and EXACT signed headers without JWT or internal headers', () => {
    TestBed.inject(AuthSession).save({
      access_token: 'secret-access',
      refresh_token: 'r'.repeat(64),
      expires_in: 900,
    });
    start();
    const req = http.expectOne(authorization.upload_url);
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.keys().sort()).toEqual(Object.keys(authorization.headers).sort());
    expect(req.request.headers.get('Content-Type')).toBe('image/png');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    expect(req.request.body).toBe(upload.file());
    req.flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
  });
  it('uses real progress events and confirms only after the successful PUT response', () => {
    start();
    const req = http.expectOne(authorization.upload_url);
    expect(req.request.reportProgress).toBe(true);
    expect(upload.progress()).toBeNull();
    req.event({ type: HttpEventType.UploadProgress, loaded: 1, total: 2 });
    expect(upload.progress()).toBe(50);
    expect(upload.stage()).toBe('uploading');
    http.expectNone(base + '/admin/media/uploads/confirm');
    req.flush(null);
    expect(upload.stage()).toBe('confirming');
    http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
  });
  it('does not confirm or refresh JWT on R2 failure', () => {
    TestBed.inject(AuthSession).save({
      access_token: 'jwt',
      refresh_token: 'r'.repeat(64),
      expires_in: 900,
    });
    start();
    http.expectOne(authorization.upload_url).flush(null, { status: 403, statusText: 'Forbidden' });
    expect(upload.stage()).toBe('failed');
    expect(upload.asset()).toBeNull();
    http.expectNone(base + '/admin/media/uploads/confirm');
    http.expectNone(base + '/auth/refresh');
    upload.start();
    http.expectNone(base + '/admin/media/uploads/presign');
  });
  it('aborts a stalled transfer without confirming or retrying the PUT', () => {
    vi.useFakeTimers();
    try {
      start();
      const req = http.expectOne(authorization.upload_url);
      vi.advanceTimersByTime(120001);
      expect(req.cancelled).toBe(true);
      expect(upload.stage()).toBe('failed');
      expect(upload.error()).toContain('dos minutos');
      expect(upload.unresolved).toBe(true);
      expect(upload.canConfirm).toBe(false);
      http.expectNone(base + '/admin/media/uploads/confirm');
      http.expectNone(authorization.upload_url);
      upload.cancel();
      http.expectOne(base + '/admin/media/uploads/upload').flush(null);
      expect(upload.stage()).toBe('cancelled');
    } finally {
      vi.useRealTimers();
    }
  });
  it('allows long uploads while real progress continues and waits for the PUT response', () => {
    vi.useFakeTimers();
    try {
      start();
      const req = http.expectOne(authorization.upload_url);
      for (const loaded of [1, 2, 3]) {
        vi.advanceTimersByTime(119000);
        req.event({ type: HttpEventType.UploadProgress, loaded, total: 3 });
        expect(req.cancelled).toBe(false);
        expect(upload.stage()).toBe('uploading');
      }
      expect(upload.progress()).toBe(100);
      http.expectNone(base + '/admin/media/uploads/confirm');
      req.flush(null);
      http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
      expect(upload.stage()).toBe('completed');
    } finally {
      vi.useRealTimers();
    }
  });
  it('handles R2 network/CORS failure without leaking provider payloads', () => {
    start();
    http.expectOne(authorization.upload_url).error(new ProgressEvent('error'));
    expect(upload.error()).toContain('conexión con el almacenamiento');
    expect(upload.error()).toContain('El archivo no está confirmado');
    expect(upload.error()).not.toContain('signature');
  });
  it('retries idempotent confirmation without another PUT and returns the same asset', () => {
    transferred();
    http.expectOne(base + '/admin/media/uploads/confirm').error(new ProgressEvent('error'));
    expect(upload.canConfirm).toBe(true);
    upload.confirm();
    const req = http.expectOne(base + '/admin/media/uploads/confirm');
    expect(req.request.body).toEqual({ upload_id: 'upload' });
    req.flush(media);
    expect(upload.asset()?.id).toBe('asset');
    upload.confirm();
    http.expectNone(() => true);
  });
  it('rejects expired authorization before PUT', () => {
    upload.select(file());
    upload.start();
    http
      .expectOne(base + '/admin/media/uploads/presign')
      .flush({ ...authorization, expires_at: '2000-01-01T00:00:00Z' });
    expect(upload.error()).toContain('expirado');
    expect(upload.stage()).toBe('failed');
    http.expectNone(authorization.upload_url);
  });
  it('honors the authoritative presign file size limit', () => {
    upload.select(file());
    upload.start();
    http
      .expectOne(base + '/admin/media/uploads/presign')
      .flush({ ...authorization, max_file_size: 1 });
    expect(upload.stage()).toBe('failed');
    http.expectNone(authorization.upload_url);
  });
  it('cancels selected files without backend calls', () => {
    upload.select(file());
    upload.cancel();
    expect(upload.stage()).toBe('cancelled');
    http.expectNone(() => true);
  });
  it('waits for an in-flight authorization then revokes it without uploading', () => {
    upload.select(file());
    upload.start();
    const req = http.expectOne(base + '/admin/media/uploads/presign');
    upload.cancel();
    req.flush(authorization);
    http
      .expectOne(base + '/admin/media/uploads/upload')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(upload.stage()).toBe('cancelled');
    http.expectNone(authorization.upload_url);
  });
  it('aborts local HTTP upload and cancels its persisted authorization', () => {
    start();
    const put = http.expectOne(authorization.upload_url);
    upload.cancel();
    expect(put.cancelled).toBe(true);
    const req = http.expectOne(base + '/admin/media/uploads/upload');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(upload.stage()).toBe('cancelled');
    upload.select(file());
    upload.start();
    http.expectOne(base + '/admin/media/uploads/presign').flush(authorization);
    http.expectOne(authorization.upload_url).flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
  });
  it('keeps failed cancellation retryable and blocks fresh authorizations', () => {
    start();
    http.expectOne(authorization.upload_url).flush(null, { status: 500, statusText: 'Error' });
    upload.cancel();
    http
      .expectOne(base + '/admin/media/uploads/upload')
      .flush({ detail: 'Storage unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(upload.unresolved).toBe(true);
    upload.start();
    http.expectNone(base + '/admin/media/uploads/presign');
    upload.cancel();
    http.expectOne(base + '/admin/media/uploads/upload').flush(null);
    expect(upload.stage()).toBe('cancelled');
  });
  it('preserves backend 429 and does not expose internal messages', () => {
    upload.select(file());
    upload.start();
    http
      .expectOne(base + '/admin/media/uploads/presign')
      .flush(
        { detail: 'Internal provider secret' },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '12' } },
      );
    expect(upload.retryAfter()).toBe('12');
    expect(upload.error()).toContain('Demasiadas');
    expect(upload.error()).not.toContain('secret');
  });
  it('handles expired confirm response with an actionable message', () => {
    transferred();
    http
      .expectOne(base + '/admin/media/uploads/confirm')
      .flush(
        { detail: 'Upload authorization expired' },
        { status: 400, statusText: 'Bad Request' },
      );
    expect(upload.error()).toContain('expirado');
  });
  it('refreshes JWT during presign without affecting signed PUT', () => {
    const session = TestBed.inject(AuthSession);
    session.save({ access_token: 'old', refresh_token: 'r'.repeat(64), expires_in: 900 });
    upload.select(file());
    upload.start();
    http
      .expectOne(base + '/admin/media/uploads/presign')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(base + '/auth/refresh').flush({
      access_token: 'new',
      refresh_token: 'n'.repeat(64),
      expires_in: 900,
      token_type: 'bearer',
    });
    const retry = http.expectOne(base + '/admin/media/uploads/presign');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush(authorization);
    const put = http.expectOne(authorization.upload_url);
    expect(put.request.headers.has('Authorization')).toBe(false);
    put.flush(null);
    const confirm = http.expectOne(base + '/admin/media/uploads/confirm');
    expect(confirm.request.headers.get('Authorization')).toBe('Bearer new');
    confirm.flush(media);
  });
  it('supports local adapter through authenticated HttpClient and exact URL', () => {
    TestBed.inject(AuthSession).save({
      access_token: 'local-jwt',
      refresh_token: 'r'.repeat(64),
      expires_in: 900,
    });
    const local = {
      ...authorization,
      provider: 'local' as const,
      upload_url: base + '/admin/media/uploads/upload/content',
    };
    api.put(local, file()).subscribe();
    const req = http.expectOne(local.upload_url);
    expect(req.request.headers.get('Authorization')).toBe('Bearer local-jwt');
    req.flush(null);
  });
  it('requests the backend-supported public policy only when explicitly selected', () => {
    upload.access.set('public');
    upload.select(file());
    upload.start();
    const request = http.expectOne(base + '/admin/media/uploads/presign');
    expect(request.request.body.access).toBe('public');
    request.flush(authorization);
    http.expectOne(authorization.upload_url).flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
  });
  it('routes local upload through the configured origin when the backend returns its own origin', () => {
    TestBed.inject(AuthSession).save({
      access_token: 'local',
      refresh_token: 'r'.repeat(64),
      expires_in: 900,
    });
    api
      .put(
        {
          ...authorization,
          provider: 'local',
          upload_url: 'http://127.0.0.1:8000/api/v1/admin/media/uploads/upload/content',
        },
        file(),
      )
      .subscribe();
    const request = http.expectOne(base + '/admin/media/uploads/upload/content');
    expect(request.request.headers.get('Authorization')).toBe('Bearer local');
    request.flush(null);
  });
  it('rejects invalid upload capabilities without issuing network requests', async () => {
    for (const invalid of [
      { ...authorization, upload_url: 'not a URL' },
      {
        ...authorization,
        provider: 'local' as const,
        upload_url: 'https://external.test/wrong-path',
      },
    ]) {
      await expect(firstValueFrom(api.put(invalid, file()))).rejects.toBeInstanceOf(Error);
    }
    http.expectNone(() => true);
  });
  it('retries failed authorization with the retained file and a fresh presign', () => {
    upload.select(file());
    upload.start();
    http.expectOne(base + '/admin/media/uploads/presign').error(new ProgressEvent('error'));
    upload.retry();
    http.expectOne(base + '/admin/media/uploads/presign').flush(authorization);
    http.expectOne(authorization.upload_url).flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(media);
    expect(upload.stage()).toBe('completed');
  });
  it('does not retry an unresolved transfer or retry invalid UX files', () => {
    upload.select(new File(['x'], 'file.gltf'));
    upload.retry();
    http.expectNone(() => true);
    start();
    http.expectOne(authorization.upload_url).flush(null, { status: 403, statusText: 'Forbidden' });
    upload.retry();
    http.expectNone(base + '/admin/media/uploads/presign');
  });
  it('resolves only backend-returned safe legacy URLs and keeps managed delivery authenticated', () => {
    expect(api.externalContentUrl(media)).toBeNull();
    expect(api.externalContentUrl({ ...media, storage_provider: 'local' })).toBeNull();
    expect(
      api.externalContentUrl(
        {
          ...media,
          storage_provider: 'external',
          url: 'https://images.test/original',
          thumbnail_url: 'https://images.test/thumb',
        },
        true,
      ),
    ).toBe('https://images.test/thumb');
    expect(
      api.externalContentUrl({
        ...media,
        storage_provider: 'external',
        url: 'javascript:alert(1)',
      }),
    ).toBeNull();
    expect(
      api.externalContentUrl({
        ...media,
        storage_provider: 'external',
        url: 'https://user:secret@images.test/file',
      }),
    ).toBeNull();
    http.expectNone(() => true);
  });
  it('maps reference restriction context and never exposes raw errors', () => {
    expect(
      mediaError(new ApiError(409, 'Media asset is still referenced', [], null, null), 'delete'),
    ).toContain('referencias');
    expect(mediaError(new ApiError(500, 'secret', [], null, null))).not.toContain('secret');
  });
  it('protects ordinary backend requests while leaving external signed requests untouched', () => {
    TestBed.inject(AuthSession).save({
      access_token: 'jwt',
      refresh_token: 'r'.repeat(64),
      expires_in: 900,
    });
    TestBed.inject(HttpClient)
      .get(base + '/admin/media')
      .subscribe();
    const request = http.expectOne(base + '/admin/media');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt');
    request.flush({});
  });
});
