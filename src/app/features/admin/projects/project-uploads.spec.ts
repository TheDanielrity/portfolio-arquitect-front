import { HttpBackend, HttpEventType, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { MEDIA_UPLOAD_BACKEND } from '../media/media-api.service';
import { MediaBrowser } from '../media/media-browser.service';
import { ProjectUploadQueue } from './project-upload-queue';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
const asset: MediaResponse = {
  id: 'asset',
  type: 'IMAGE',
  original_filename: 'image.png',
  storage_provider: 'r2',
  storage_key: 'private',
  url: 'https://api.test/content',
  thumbnail_url: null,
  mime_type: 'image/png',
  file_size: 3,
  width: 1,
  height: 1,
  title: null,
  alt_text: null,
  description: null,
  metadata: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

const base = 'https://api.test/api/v1';
const authorization = {
  upload_id: 'u',
  upload_url: 'https://test.r2.cloudflarestorage.com/upload',
  headers: { 'Content-Type': 'image/png' },
  expires_at: '2099-01-01T00:00:00Z',
  max_file_size: 1000,
  provider: 'r2',
};
describe('Project integrated upload queue', () => {
  let queue: ProjectUploadQueue;
  let http: HttpTestingController;
  const revoke = vi.fn();
  beforeEach(() => {
    revoke.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: base },
        { provide: MEDIA_UPLOAD_BACKEND, useExisting: HttpBackend },
        { provide: MediaBrowser, useValue: { create: () => 'blob:local-preview', revoke } },
        ProjectUploadQueue,
      ],
    });
    queue = TestBed.inject(ProjectUploadQueue);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  const files = () => [
    new File(['png'], 'one.png', { type: 'image/png' }),
    new File(['png'], 'two.png', { type: 'image/png' }),
  ];
  it('replaces a broken preview without discarding the file or its upload state', () => {
    queue.add('p', files().slice(0, 1), 'COVER');
    const job = queue.jobs()[0];
    queue.previewFailed(job);
    expect(job.preview).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:local-preview');
    expect(job.file.name).toBe('one.png');
    expect(job.upload.stage()).toBe('selected');
    expect(queue.jobs()[0]).toBe(job);
  });
  function tick() {
    TestBed.tick();
  }
  function presign() {
    tick();
    const request = http.expectOne(base + '/admin/media/uploads/presign');
    expect(request.request.body.access).toBe('public');
    request.flush(authorization);
    return http.expectOne(authorization.upload_url);
  }
  function transfer() {
    const put = presign();
    put.flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(asset);
    tick();
  }
  function links(items: unknown[] = []) {
    http
      .expectOne((r) => r.url === base + '/admin/projects/p/media')
      .flush({ items, total: items.length, offset: 0, limit: 100 });
  }
  const link = {
    id: 'l',
    media_id: asset.id,
    project_id: 'p',
    role: 'GALLERY',
    sort_order: 0,
    created_at: '2026-01-01',
  };
  it('requires a persisted project before any transfer', () => {
    queue.add('', files(), 'GALLERY');
    tick();
    expect(queue.jobs()).toHaveLength(0);
    http.expectNone(() => true);
  });
  it('queues multiple files serially and confirms and associates before marking ready', () => {
    queue.add('p', files(), 'GALLERY');
    const put = presign();
    expect(put.request.headers.has('Authorization')).toBe(false);
    put.event({ type: HttpEventType.UploadProgress, loaded: 3, total: 3 });
    expect(queue.pending()).toBe(true);
    expect(queue.jobs()[0].association()).toBe('waiting');
    http.expectNone(base + '/admin/media/uploads/confirm');
    put.flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(asset);
    tick();
    links();
    const attach = http.expectOne(base + '/admin/projects/p/media');
    expect(attach.request.body).toEqual({ media_id: asset.id, role: 'GALLERY', sort_order: 0 });
    expect(queue.jobs()[0].association()).toBe('associating');
    attach.flush(link);
    tick();
    expect(queue.jobs()[0].association()).toBe('completed');
    http
      .expectOne(base + '/admin/media/uploads/presign')
      .flush({ ...authorization, upload_id: 'u2' });
    http.expectOne(authorization.upload_url).flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').flush({ ...asset, id: 'second' });
    tick();
    links([link]);
    http
      .expectOne(base + '/admin/projects/p/media')
      .flush({ ...link, id: 'l2', media_id: 'second' });
    tick();
    expect(queue.pending()).toBe(false);
    expect(queue.completedVersion()).toBe(2);
  });
  it('retries association without another upload or confirm and reconciles ambiguous success', () => {
    queue.add('p', files().slice(0, 1), 'GALLERY');
    transfer();
    links();
    http.expectOne(base + '/admin/projects/p/media').error(new ProgressEvent('error'));
    tick();
    const job = queue.jobs()[0];
    expect(job.association()).toBe('failed');
    expect(job.upload.asset()).toBe(asset);
    queue.retry(job);
    queue.retry(job);
    tick();
    links([link]);
    tick();
    expect(job.association()).toBe('completed');
    http.expectNone((r) => r.method === 'POST' || r.method === 'PUT');
  });
  it('replaces cover through the atomic endpoint after upload confirmation', () => {
    queue.add('p', files().slice(0, 1), 'COVER');
    transfer();
    links([{ ...link, role: 'COVER', media_id: 'old' }]);
    const replace = http.expectOne(base + '/admin/projects/p/cover');
    expect(replace.request.body).toEqual({ media_id: asset.id });
    http.expectNone((r) => r.method === 'DELETE');
    replace.flush({ ...link, role: 'COVER' });
    tick();
    expect(queue.pending()).toBe(false);
  });
  it('dismisses successful cover feedback after five seconds without deleting the file or association', () => {
    vi.useFakeTimers();
    try {
      queue.add('p', files().slice(0, 1), 'COVER');
      transfer();
      links();
      http.expectOne(base + '/admin/projects/p/cover').flush({ ...link, role: 'COVER' });
      tick();
      vi.advanceTimersByTime(4999);
      expect(queue.jobs()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(queue.jobs()).toHaveLength(0);
      expect(queue.completedVersion()).toBe(1);
      expect(revoke).toHaveBeenCalledWith('blob:local-preview');
      http.expectNone((request) => request.method === 'DELETE');
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps failed cover transfers visible after three seconds', () => {
    vi.useFakeTimers();
    try {
      queue.add('p', files().slice(0, 1), 'COVER');
      presign().error(new ProgressEvent('error'));
      vi.advanceTimersByTime(3000);
      expect(queue.jobs()).toHaveLength(1);
      expect(queue.jobs()[0].upload.stage()).toBe('failed');
      queue.cancel(queue.jobs()[0]);
      http.expectOne(base + '/admin/media/uploads/u').flush(null);
    } finally {
      vi.useRealTimers();
    }
  });
  it('also dismisses successful photographs after five seconds', () => {
    vi.useFakeTimers();
    try {
      queue.add('p', files().slice(0, 1), 'GALLERY');
      transfer();
      links();
      http.expectOne(base + '/admin/projects/p/media').flush(link);
      tick();
      vi.advanceTimersByTime(4999);
      expect(queue.jobs()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(queue.jobs()).toHaveLength(0);
      http.expectNone((request) => request.method === 'DELETE');
    } finally {
      vi.useRealTimers();
    }
  });
  it('retains uploaded assets when removing an unassociated result', () => {
    queue.add('p', files().slice(0, 1), 'GALLERY');
    transfer();
    links();
    http
      .expectOne(base + '/admin/projects/p/media')
      .flush(null, { status: 409, statusText: 'Conflict' });
    tick();
    const job = queue.jobs()[0];
    queue.cancel(job);
    queue.remove(job);
    tick();
    expect(queue.jobs()).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith('blob:local-preview');
    http.expectNone((r) => r.method === 'DELETE');
  });
  it('retries an ambiguous confirmation without uploading the file twice', () => {
    queue.add('p', files().slice(0, 1), 'GALLERY');
    presign().flush(null);
    http.expectOne(base + '/admin/media/uploads/confirm').error(new ProgressEvent('error'));
    tick();
    queue.retry(queue.jobs()[0]);
    http.expectNone(authorization.upload_url);
    http.expectOne(base + '/admin/media/uploads/confirm').flush(asset);
    tick();
    links();
    http.expectOne(base + '/admin/projects/p/media').flush(link);
    tick();
    expect(queue.pending()).toBe(false);
  });
  it('does not confirm or associate a failed PUT and revokes before retry', () => {
    queue.add('p', files().slice(0, 1), 'GALLERY');
    presign().error(new ProgressEvent('error'));
    tick();
    http.expectNone(base + '/admin/media/uploads/confirm');
    const job = queue.jobs()[0];
    queue.retry(job);
    http.expectOne(base + '/admin/media/uploads/u').flush(null);
    tick();
    http.expectOne(base + '/admin/media/uploads/presign').flush(authorization);
    const put = http.expectOne(authorization.upload_url);
    queue.cancel(job);
    expect(put.cancelled).toBe(true);
    http.expectOne(base + '/admin/media/uploads/u').flush(null);
    tick();
    expect(queue.pending()).toBe(false);
  });
  it('rejects invalid formats and non-image covers without presign', () => {
    queue.add(
      'p',
      [new File(['x'], 'bad.gltf'), new File(['pdf'], 'cv.pdf', { type: 'application/pdf' })],
      'COVER',
    );
    tick();
    expect(queue.jobs().every((j) => j.upload.stage() === 'failed')).toBe(true);
    http.expectNone(() => true);
    queue.jobs().forEach((j) => queue.cancel(j));
    tick();
    expect(queue.pending()).toBe(false);
  });
  it('keeps PDF and GLB uploads with their existing project roles', () => {
    queue.add(
      'p',
      [
        new File(['pdf'], 'drawing.pdf', { type: 'application/pdf' }),
        new File(['glb'], 'model.glb'),
      ],
      'GALLERY',
    );
    expect(queue.jobs().map((job) => job.role)).toEqual(['DOCUMENT', 'MODEL']);
    queue.jobs().forEach((job) => queue.cancel(job));
    tick();
    http.expectNone(() => true);
  });
  it('does not retry a rejected non-image cover through the upload engine', () => {
    queue.add('p', [new File(['pdf'], 'drawing.pdf', { type: 'application/pdf' })], 'COVER');
    queue.retry(queue.jobs()[0]);
    tick();
    http.expectNone(() => true);
    expect(queue.jobs()[0].upload.stage()).toBe('failed');
  });
});
