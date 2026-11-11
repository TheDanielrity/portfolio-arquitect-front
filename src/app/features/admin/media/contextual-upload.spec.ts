import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import type { MediaResponse } from '../../../core/api/generated/types.gen';
import { MediaUploadPanel } from './media-upload-panel';

describe('Contextual profile uploads', () => {
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
  it('starts a public contextual photo upload immediately without showing a configuration panel', () => {
    const f = TestBed.createComponent(MediaUploadPanel);
    f.componentRef.setInput('target', 'photo');
    f.componentRef.setInput('compact', true);
    f.componentRef.setInput(
      'selectedFile',
      new File(['image'], 'portrait.png', { type: 'image/png' }),
    );
    f.detectChanges();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'https://api.test/api/v1/admin/media/uploads/presign',
    );
    expect(request.request.body.access).toBe('public');
    expect(f.nativeElement.querySelector('select')).toBeNull();
    expect(f.nativeElement.querySelector('input[type=file]')).toBeNull();
    expect(f.componentInstance.upload.stage()).toBe('authorizing');
    request.flush({}, { status: 500, statusText: 'Error' });
  });
  it('emits a file for association only after successful backend confirmation', () => {
    const f = TestBed.createComponent(MediaUploadPanel);
    f.componentRef.setInput('target', 'photo');
    const selected = vi.fn();
    f.componentInstance.completed.subscribe(selected);
    const upload = f.componentInstance.upload;
    upload.asset.set({ id: 'confirmed', type: 'IMAGE' } as MediaResponse);
    upload.stage.set('confirming');
    f.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    upload.stage.set('completed');
    f.detectChanges();
    expect(selected).toHaveBeenCalledExactlyOnceWith(upload.asset());
  });
  it('rejects a project image in the CV uploader before requesting authorization', () => {
    const f = TestBed.createComponent(MediaUploadPanel);
    f.componentRef.setInput('target', 'cv');
    f.detectChanges();
    f.componentInstance.select({
      target: { files: [new File(['x'], 'plan.png', { type: 'image/png' })], value: '' },
    } as unknown as Event);
    expect(f.componentInstance.upload.file()).toBeNull();
    expect(f.componentInstance.upload.error()).toContain('PDF');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
