import { HttpBackend, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { convertStl } from '../../../shared/utils/stl-conversion';
import { MediaUpload } from './media-upload.service';
import { MEDIA_UPLOAD_BACKEND } from './media-api.service';
import { StlConverter, StlConversionEvent } from './stl-converter';
import { validateFile } from './media-policy';
import { readStlFile, StlFileReadError } from './stl-file';

describe('STL conversion before the unchanged upload contract', () => {
  it('accepts exactly 100 MiB of STL source and rejects one byte more', () => {
    const file = { name: 'building.stl', type: '', size: 100 * 1024 * 1024 } as File;
    expect(validateFile(file).file_size).toBe(104857600);
    expect(() => validateFile({ ...file, size: file.size + 1 } as File)).toThrow('100 MiB');
  });
  let events: Subject<StlConversionEvent>;
  let upload: MediaUpload;
  let http: HttpTestingController;
  const source = () => new File(['solid source'], 'building.STL');
  const converted = () =>
    new File(
      [
        convertStl(
          new TextEncoder().encode(
            'solid\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid',
          ).buffer,
        ),
      ],
      'building.glb',
      { type: 'model/gltf-binary' },
    );
  beforeEach(() => {
    events = new Subject();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: MEDIA_UPLOAD_BACKEND, useExisting: HttpBackend },
        { provide: StlConverter, useValue: { convert: () => events } },
        MediaUpload,
      ],
    });
    upload = TestBed.inject(MediaUpload);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify({ ignoreCancelled: true }));
  it('waits for conversion, signs the actual GLB size, uses exact signed headers and confirms', () => {
    upload.select(source());
    upload.start();
    expect(upload.stage()).toBe('converting');
    http.expectNone(() => true);
    events.next({ progress: 40 });
    expect(upload.conversionProgress()).toBe(40);
    const glb = converted();
    events.next({ file: glb });
    events.complete();
    const presign = http.expectOne('https://api.test/api/v1/admin/media/uploads/presign');
    expect(presign.request.body).toEqual({ ...validateFile(glb), access: 'private' });
    const headers = { 'Content-Type': 'model/gltf-binary', 'x-amz-meta-test': 'signed' };
    presign.flush({
      upload_id: 'u',
      upload_url: 'https://bucket.r2.cloudflarestorage.com/model',
      headers,
      expires_at: '2099-01-01T00:00:00Z',
      max_file_size: 104857600,
      provider: 'r2',
    });
    const put = http.expectOne('https://bucket.r2.cloudflarestorage.com/model');
    expect(put.request.body).toBe(glb);
    expect(put.request.headers.keys().sort()).toEqual(Object.keys(headers).sort());
    expect(put.request.withCredentials).toBe(false);
    put.flush(null);
    expect(upload.asset()).toBeNull();
    const confirm = http.expectOne('https://api.test/api/v1/admin/media/uploads/confirm');
    confirm.flush({ id: 'model', type: 'MODEL_3D', mime_type: 'model/gltf-binary' });
    expect(upload.stage()).toBe('completed');
  });
  it('handles conversion error and retry without sending STL to the API', () => {
    upload.select(source());
    upload.start();
    events.error(new Error('STL inválido'));
    expect(upload.stage()).toBe('failed');
    expect(upload.error()).toContain('STL inválido');
    events = new Subject();
    upload.retry();
    expect(upload.stage()).toBe('converting');
    upload.cancel();
    expect(events.observed).toBe(false);
    expect(upload.stage()).toBe('cancelled');
    http.expectNone(() => true);
  });
  it('requires a fresh file selection after a blocked local read instead of retrying the stale reference', () => {
    upload.select(source());
    upload.start();
    events.error(new StlFileReadError());
    expect(upload.stage()).toBe('failed');
    expect(upload.requiresFileSelection()).toBe(true);
    expect(upload.error()).toContain('DLP');
    upload.retry();
    expect(upload.stage()).toBe('failed');
    http.expectNone(() => true);
    events = new Subject();
    upload.select(source());
    expect(upload.requiresFileSelection()).toBe(false);
    upload.start();
    expect(events.observed).toBe(true);
    upload.cancel();
  });
  it('cancels the conversion subscription when disposed', () => {
    upload.select(source());
    upload.start();
    upload.ngOnDestroy();
    expect(events.observed).toBe(false);
    http.expectNone(() => true);
  });
  it('enforces the backend authorization size against the converted bytes before PUT', () => {
    upload.select(source());
    upload.start();
    events.next({ file: converted() });
    events.complete();
    http.expectOne('https://api.test/api/v1/admin/media/uploads/presign').flush({
      upload_id: 'u',
      upload_url: 'https://r2.test/model',
      headers: {},
      expires_at: '2099-01-01',
      max_file_size: 1,
      provider: 'r2',
    });
    expect(upload.stage()).toBe('failed');
    http.expectNone('https://r2.test/model');
    upload.cancel();
    http.expectOne('https://api.test/api/v1/admin/media/uploads/u').flush(null);
  });
  it('rejects a converter output larger than the existing GLB limit before presign', () => {
    upload.select(source());
    upload.start();
    const invalid = { name: 'large.glb', type: 'model/gltf-binary', size: 104857601 } as File;
    events.next({ file: invalid });
    events.complete();
    expect(upload.stage()).toBe('failed');
    http.expectNone(() => true);
  });
  it('does not invoke a worker for existing GLB files', () => {
    const converter = vi.spyOn(TestBed.inject(StlConverter), 'convert');
    upload.select(converted());
    upload.start();
    expect(converter).not.toHaveBeenCalled();
    http
      .expectOne('https://api.test/api/v1/admin/media/uploads/presign')
      .flush({}, { status: 503, statusText: 'Unavailable' });
  });
  it.each(['obj', '3mf', 'gltf'])('continues rejecting %s', (ext) => {
    expect(() => validateFile(new File(['x'], 'model.' + ext))).toThrow();
  });
});

describe('Worker lifecycle and resource budget', () => {
  it('classifies local read failures independently of STL conversion errors', async () => {
    await expect(
      readStlFile({
        arrayBuffer: () => Promise.reject(new DOMException('Blocked', 'NotReadableError')),
      }),
    ).rejects.toBeInstanceOf(StlFileReadError);
    const bytes = new ArrayBuffer(4);
    await expect(readStlFile({ arrayBuffer: async () => bytes })).resolves.toBe(bytes);
  });
  it('maps read failures sent by the worker to a useful error and terminates it', () => {
    let deliver!: (event: MessageEvent) => void;
    const terminate = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        set onmessage(callback: (event: MessageEvent) => void) {
          deliver = callback;
        }
        postMessage() {
          /* Test supplies worker reply. */
        }
        terminate = terminate;
      },
    );
    let error: unknown;
    new StlConverter()
      .convert(new File(['x'], 'x.stl'))
      .subscribe({ error: (e: unknown) => (error = e) });
    deliver({ data: { code: 'FILE_READ_FAILED', error: 'Raw browser message' } } as MessageEvent);
    expect(error).toBeInstanceOf(StlFileReadError);
    expect((error as Error).message).toContain('Vuelve a seleccionar');
    expect(terminate).toHaveBeenCalledOnce();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it('offers an actionable fallback without Worker support', () => {
    vi.stubGlobal('Worker', undefined);
    let error = '';
    new StlConverter()
      .convert(new File(['x'], 'x.stl'))
      .subscribe({ error: (e: Error) => (error = e.message) });
    expect(error).toContain('GLB');
  });
  it('terminates timed out and cancelled workers', () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    vi.stubGlobal(
      'Worker',
      class {
        postMessage() {
          /* waiting worker */
        }
        terminate = terminate;
      },
    );
    let error = '';
    new StlConverter()
      .convert(new File(['x'], 'x.stl'))
      .subscribe({ error: (e: Error) => (error = e.message) });
    vi.advanceTimersByTime(60001);
    expect(error).toContain('60 segundos');
    expect(terminate).toHaveBeenCalledOnce();
    const sub = new StlConverter().convert(new File(['x'], 'x.stl')).subscribe();
    sub.unsubscribe();
    expect(terminate).toHaveBeenCalledTimes(2);
  });
});
