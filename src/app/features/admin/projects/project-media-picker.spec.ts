import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
import { MediaBrowser } from '../media/media-browser.service';
import { ProjectMediaPicker } from './project-media-picker';

describe('Project photograph selection', () => {
  const originalShowModal = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  let http: HttpTestingController;
  const revoke = vi.fn();
  const asset: MediaResponse = {
    id: 'photo',
    type: 'IMAGE',
    original_filename: 'maqueta.png',
    title: 'Maqueta',
    storage_provider: 'r2',
    storage_key: 'private',
    url: 'https://api.test/api/v1/public/media/photo/content',
    thumbnail_url: null,
    mime_type: 'image/png',
    file_size: 10,
    width: 2400,
    height: 1500,
    alt_text: 'Vista de la maqueta',
    description: null,
    metadata: null,
    created_at: '',
    updated_at: '',
  };
  beforeEach(() => {
    revoke.mockClear();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        { provide: MediaBrowser, useValue: { create: () => 'blob:preview', revoke } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    vi.useRealTimers();
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
    if (originalShowModal)
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  });
  function picker() {
    const fixture = TestBed.createComponent(ProjectMediaPicker);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.componentRef.setInput('mediaType', 'IMAGE');
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/media')
      .flush({ items: [{ media_id: asset.id, role: 'GALLERY' }], total: 1, limit: 100, offset: 0 });
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/sections')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    http.expectOne('https://api.test/api/v1/admin/media/photo').flush(asset);
    fixture.detectChanges();
    return fixture;
  }
  it('loads the preview immediately and selects from the image button without management controls', () => {
    const fixture = picker();
    const selected = vi.fn();
    fixture.componentInstance.selected.subscribe(selected);
    const preview = http.expectOne('https://api.test/api/v1/admin/media/photo/content');
    expect(preview.request.responseType).toBe('blob');
    preview.flush(new Blob(['png'], { type: 'image/png' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Ver imagen');
    expect(fixture.nativeElement.textContent).not.toContain('Ver detalles y gestionar');
    expect(fixture.nativeElement.querySelector('app-media-detail')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.querySelector('form button')).toBeNull();
    const button = fixture.nativeElement.querySelector('.photo-option') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Seleccionar fotografía Maqueta');
    (button.querySelector('img') as HTMLImageElement).click();
    expect(selected).toHaveBeenCalledWith(asset);
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:preview');
  });
  it('filters photographs automatically from the search field', () => {
    vi.useFakeTimers();
    const fixture = picker();
    http.expectOne('https://api.test/api/v1/admin/media/photo/content').flush(new Blob(['png']));
    fixture.componentInstance.filters.controls.q.setValue('otra fotografía');
    vi.advanceTimersByTime(251);
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/media')
      .flush({ items: [{ media_id: asset.id, role: 'GALLERY' }], total: 1, limit: 100, offset: 0 });
    http
      .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/sections')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    http.expectOne('https://api.test/api/v1/admin/media/photo').flush(asset);
    fixture.detectChanges();
    expect(fixture.componentInstance.page()?.items).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('No hay fotografías');
  });
  it('applies the latest search even when it is typed during the initial load', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(ProjectMediaPicker);
    fixture.componentRef.setInput('projectId', 'p');
    fixture.componentRef.setInput('mediaType', 'IMAGE');
    fixture.detectChanges();
    fixture.componentInstance.filters.controls.q.setValue('sin coincidencia');
    vi.advanceTimersByTime(251);
    for (let i = 0; i < 2; i++) {
      http
        .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/media')
        .flush({ items: [], total: 0, limit: 100, offset: 0 });
      http
        .expectOne((r) => r.url === 'https://api.test/api/v1/admin/projects/p/sections')
        .flush({ items: [], total: 0, limit: 100, offset: 0 });
    }
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.componentInstance.page()?.items).toEqual([]);
  });
  it('uses a labelled X and preserves closing by Escape', () => {
    const fixture = picker();
    http.expectOne('https://api.test/api/v1/admin/media/photo/content').flush(new Blob(['png']));
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const button = fixture.nativeElement.querySelector('.close-picker') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('×');
    expect(button.getAttribute('aria-label')).toBe('Cerrar selector');
    button.click();
    expect(closed).toHaveBeenCalledOnce();
    const event = new Event('cancel', { cancelable: true });
    fixture.nativeElement.querySelector('dialog').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(closed).toHaveBeenCalledTimes(2);
  });
  it('shows preview failures without reinstating the view-image button', () => {
    const fixture = picker();
    http
      .expectOne('https://api.test/api/v1/admin/media/photo/content')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Ver imagen');
    expect(fixture.nativeElement.querySelector('.photo-option')).not.toBeNull();
  });
});
