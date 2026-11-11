import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { MediaDetail } from './media-detail';
import { MediaPreview } from './media-preview';
import { MediaBrowser } from './media-browser.service';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
const base = 'https://api.test/api/v1/admin/media';
const asset: MediaResponse = {
  id: 'asset',
  type: 'IMAGE',
  original_filename: 'plan.png',
  storage_provider: 'r2',
  storage_key: 'sensitive-key',
  url: 'https://not-public.test/asset',
  thumbnail_url: null,
  mime_type: 'image/png',
  file_size: 3,
  width: 100,
  height: 100,
  title: 'Plano',
  alt_text: 'Plano de planta',
  description: 'Descripción',
  metadata: { secret: 'hidden' },
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
};
describe('Media detail, metadata and deletion', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function open() {
    const f = TestBed.createComponent(MediaDetail);
    f.componentRef.setInput('id', 'asset');
    f.detectChanges();
    await f.whenStable();
    http.expectOne(base + '/asset').flush(asset);
    f.detectChanges();
    return f;
  }
  it('loads exact detail, opens an accessible dialog and reuses available fields', async () => {
    const f = await open();
    expect(f.nativeElement.querySelector('dialog').open).toBe(true);
    expect(f.nativeElement.querySelector('dialog').getAttribute('aria-labelledby')).toBe(
      'detail-title',
    );
    expect(f.componentInstance.form.getRawValue().title).toBe('Plano');
    expect(f.nativeElement.textContent).not.toContain('sensitive-key');
  });
  it('saves only allowed metadata and prevents duplicate requests', async () => {
    const f = await open();
    f.componentInstance.form.controls.title.setValue('Nuevo');
    f.componentInstance.save();
    f.componentInstance.save();
    const req = http.expectOne(base + '/asset');
    expect(req.request.body).toEqual({
      title: 'Nuevo',
      alt_text: 'Plano de planta',
      description: 'Descripción',
    });
    expect(f.componentInstance.saving()).toBe(true);
    req.flush({ ...asset, title: 'Nuevo' });
    expect(f.componentInstance.asset()?.title).toBe('Nuevo');
    expect(f.componentInstance.notice()).toContain('guardada');
  });
  it('does not remove a referenced asset on 409 and leaves dialog open', async () => {
    const f = await open();
    const changed = vi.fn();
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.deleteConfirmation.set(true);
    f.componentInstance.remove();
    http
      .expectOne(base + '/asset')
      .flush(
        { detail: 'Media asset is still referenced' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(f.componentInstance.asset()).toEqual(asset);
    expect(f.componentInstance.error()).toContain('referencias');
    expect(f.nativeElement.querySelector('dialog').open).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });
  it('requires explicit delete confirmation and removes only after success', async () => {
    const f = await open();
    const closed = vi.fn();
    const changed = vi.fn();
    f.componentInstance.closed.subscribe(closed);
    f.componentInstance.changed.subscribe(changed);
    f.componentInstance.remove();
    http.expectNone(() => true);
    f.componentInstance.deleteConfirmation.set(true);
    f.componentInstance.remove();
    f.componentInstance.remove();
    http.expectOne(base + '/asset').flush(null, { status: 204, statusText: 'No Content' });
    expect(closed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });
  it('preserves asset when deletion fails from network error', async () => {
    const f = await open();
    f.componentInstance.deleteConfirmation.set(true);
    f.componentInstance.remove();
    http.expectOne(base + '/asset').error(new ProgressEvent('error'));
    expect(f.componentInstance.asset()).toEqual(asset);
    expect(f.componentInstance.deleting()).toBe(false);
  });
  it('maps backend field validation and preserves Retry-After', async () => {
    const f = await open();
    f.componentInstance.save();
    http
      .expectOne(base + '/asset')
      .flush(
        { detail: [{ loc: ['body', 'title'], msg: 'Invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Unprocessable', headers: { 'Retry-After': '10' } },
      );
    expect(f.componentInstance.form.controls.title.invalid).toBe(true);
    expect(f.componentInstance.retryAfter()).toBe('10');
  });
});
describe('Private preview lifetime', () => {
  it('releases Object URLs, permits one image renewal and avoids loops', () => {
    const create = vi.fn().mockReturnValue('blob:test');
    const revoke = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: MediaBrowser, useValue: { create, revoke, download: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(MediaPreview);
    f.componentRef.setInput('asset', asset);
    f.detectChanges();
    f.componentInstance.load(false);
    http.expectOne(base + '/asset/content').flush(new Blob(['image']));
    expect(f.componentInstance.url()).toBe('blob:test');
    f.componentInstance.imageError();
    http.expectOne(base + '/asset/content').flush(new Blob(['image']));
    f.componentInstance.imageError();
    http.expectNone(() => true);
    expect(f.componentInstance.error()).toContain('No se puede mostrar');
    expect(revoke).toHaveBeenCalledWith('blob:test');
    f.destroy();
    http.verify();
  });
});
