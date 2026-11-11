import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../../core/api/api-config';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  MediaResponse,
  ProfileResponse,
  ServiceResponse,
  SocialResponse,
} from '../../../core/api/generated/types.gen';
import { ProfilePage } from './profile-page';
import { ServicesPage } from './services-page';
import { SocialLinks } from './social-links';
import { SettingsPage } from './settings-page';
import { webUrl } from './content-forms';
import { FormControl } from '@angular/forms';
const base = 'https://api.test/api/v1/admin';
const profile: ProfileResponse = {
  id: 'p',
  first_name: 'Ana',
  last_name: 'López',
  is_active: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const service: ServiceResponse = {
  id: 's',
  name: 'Diseño',
  slug: 'diseno',
  sort_order: 0,
  is_visible: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const social: SocialResponse = {
  id: 'l',
  profile_id: 'p',
  platform: 'Custom',
  url: 'https://example.test/',
  sort_order: 0,
  is_visible: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};
const asset = (type = 'IMAGE') =>
  ({
    id: 'm',
    type,
    mime_type: type === 'IMAGE' ? 'image/png' : 'application/pdf',
    original_filename: 'file',
    storage_provider: 'r2',
  }) as MediaResponse;
describe('Global content UI', () => {
  it('highlights the logo drop zone across child elements and resets after leaving or dropping', () => {
    const editor = existingProfile().componentInstance;
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { types: ['Files'], files: [] },
    } as unknown as DragEvent;
    editor.logoDragEnter(event);
    editor.logoDragEnter(event);
    editor.logoDragLeave(event);
    expect(editor.logoDragActive()).toBe(true);
    editor.logoDragLeave(event);
    expect(editor.logoDragActive()).toBe(false);
    editor.logoDragEnter(event);
    editor.logoDropped(event);
    expect(editor.logoDragActive()).toBe(false);
    editor.saving.set(true);
    editor.logoDragEnter(event);
    expect(editor.logoDragActive()).toBe(false);
  });
  it('accepts a single dropped logo through the existing upload flow and protects a pending selection', () => {
    const f = existingProfile();
    const editor = f.componentInstance;
    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    const event = {
      preventDefault: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as DragEvent;
    editor.logoDropped(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(editor.photoFile()).toBe(file);
    expect(editor.uploadTarget()).toBe('profile_media_id');
    editor.saving.set(true);
    editor.logoDropped({
      preventDefault: vi.fn(),
      dataTransfer: { files: [new File([], 'other.png')] },
    } as unknown as DragEvent);
    expect(editor.photoFile()).toBe(file);
  });
  it('rejects dropping several files for the single profile logo', () => {
    const editor = existingProfile().componentInstance;
    editor.logoDropped({
      preventDefault: vi.fn(),
      dataTransfer: { files: [new File([], 'a.png'), new File([], 'b.png')] },
    } as unknown as DragEvent);
    expect(editor.mediaError()).toContain('un solo archivo');
    expect(editor.photoFile()).toBeNull();
  });
  it('creates WhatsApp with a generated URL, encoded message and no duplicate submission', () => {
    const f = TestBed.createComponent(SocialLinks);
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const e = f.componentInstance;
    e.whatsappForm.patchValue({ phone: '987 654 321', message: 'Hola & diseño', is_visible: true });
    e.saveWhatsapp();
    e.saveWhatsapp();
    const request = http.expectOne((r) => r.method === 'POST');
    expect(request.request.body).toEqual({
      platform: 'WhatsApp',
      url: 'https://wa.me/51987654321?text=Hola%20%26%20dise%C3%B1o',
      is_visible: true,
      sort_order: 0,
    });
    request.flush({ ...social, ...request.request.body });
    expect(e.whatsappForm.pristine).toBe(true);
    expect(e.whatsappNotice()).toContain('visible');
  });
  it('populates and patches the existing WhatsApp without changing its username or order', () => {
    const f = TestBed.createComponent(SocialLinks);
    f.detectChanges();
    const whatsapp = {
      ...social,
      platform: 'WhatsApp',
      url: 'https://wa.me/51987654321?text=Hola',
      username: 'Ana',
      sort_order: 4,
    };
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([whatsapp]));
    const e = f.componentInstance;
    expect(e.whatsappForm.getRawValue()).toEqual({
      country: '51',
      code: '',
      phone: '987654321',
      message: 'Hola',
      is_visible: true,
    });
    expect(e.otherLinks()).toEqual([]);
    e.whatsappForm.controls.is_visible.setValue(false);
    e.saveWhatsapp();
    const request = http.expectOne(base + '/profile/social-links/l');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ url: whatsapp.url, is_visible: false });
    request.flush({ ...whatsapp, is_visible: false });
    expect(e.whatsappNotice()).toContain('oculto');
  });
  it('preserves WhatsApp drafts and navigation protection after a failed save', () => {
    const f = TestBed.createComponent(SocialLinks);
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const e = f.componentInstance;
    e.whatsappForm.patchValue({ phone: '987654321' });
    e.whatsappForm.markAsDirty();
    e.saveWhatsapp();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ detail: 'Invalid' }, { status: 422, statusText: 'Invalid' });
    expect(e.whatsappError()).toBeTruthy();
    expect(e.whatsappForm.controls.phone.value).toBe('987654321');
    expect(e.whatsappForm.enabled).toBe(true);
    expect(e.hasChanges()).toBe(true);
  });
  it('blocks invalid phone numbers and offers a safe preview before saving', () => {
    const f = TestBed.createComponent(SocialLinks);
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const e = f.componentInstance;
    e.whatsappForm.controls.phone.setValue('abc');
    e.saveWhatsapp();
    expect(e.whatsappPreview()).toBeNull();
    http.expectNone((r) => r.method === 'POST');
    e.whatsappForm.controls.phone.setValue('987654321');
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[target="_blank"]').getAttribute('href')).toBe(
      'https://wa.me/51987654321',
    );
    expect(f.nativeElement.textContent).not.toContain('Configurar WhatsApp');
  });
  let http: HttpTestingController;
  let authenticated: boolean;
  beforeEach(() => {
    authenticated = true;
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
        provideRouter([]),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        {
          provide: AuthService,
          useValue: { status: () => (authenticated ? 'authenticated' : 'unauthenticated') },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function page(items: unknown[]) {
    return { items, total: items.length, limit: 100, offset: 0 };
  }
  function existingProfile() {
    const f = TestBed.createComponent(ProfilePage);
    f.detectChanges();
    http.expectOne(base + '/profile').flush(profile);
    return f;
  }
  it('assigns a confirmed contextual upload to the profile form without saving or deleting other references', () => {
    const f = existingProfile();
    const editor = f.componentInstance;
    editor.uploadTarget.set('cv_media_id');
    editor.uploaded(asset('PDF'));
    expect(editor.form.controls.cv_media_id.value).toBe('m');
    expect(editor.form.controls.profile_media_id.value).toBeNull();
    expect(editor.form.dirty).toBe(true);
    http.expectNone((request) => request.method !== 'GET');
  });
  it('renders profile uploads in their own section and blocks navigation while confirmation is pending', () => {
    const f = existingProfile();
    f.componentInstance.openUpload('profile_media_id');
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const upload = f.componentInstance.uploadPanel()!.upload;
    expect(f.nativeElement.querySelector('app-media-upload')).not.toBeNull();
    expect(f.nativeElement.querySelector('[routerLink="/admin/media"]')).toBeNull();
    upload.stage.set('confirming');
    expect(f.componentInstance.canLeave()).toBe(false);
    f.componentInstance.openUpload('cv_media_id');
    expect(f.componentInstance.uploadTarget()).toBe('profile_media_id');
    upload.stage.set('cancelled');
  });
  function services() {
    const f = TestBed.createComponent(ServicesPage);
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/services').flush(page([service]));
    return f;
  }
  it('keeps a completed upload associated with its original destination, independently of the picker', () => {
    const f = existingProfile();
    const editor = f.componentInstance;
    editor.uploadTarget.set('profile_media_id');
    editor.picker.set('cv_media_id');
    editor.uploaded(asset());
    expect(editor.form.controls.profile_media_id.value).toBe('m');
    expect(editor.form.controls.cv_media_id.value).toBeNull();
    expect(editor.picker()).toBe('cv_media_id');
  });
  it('blocks changing upload destinations and saving while a selected file has not been uploaded', () => {
    const f = existingProfile();
    const editor = f.componentInstance;
    editor.openUpload('profile_media_id');
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    editor.uploadPanel()!.upload.select(new File(['image'], 'photo.png', { type: 'image/png' }));
    editor.openUpload('cv_media_id');
    editor.openPicker('cv_media_id');
    editor.save();
    expect(editor.uploadTarget()).toBe('profile_media_id');
    expect(editor.picker()).toBeNull();
    expect(editor.uploadPending()).toBe(true);
    http.expectNone((r) => r.method === 'PATCH');
    editor.uploadPanel()!.upload.stage.set('cancelled');
  });
  it('does not prompt to discard a confirmed upload after the profile is clean', () => {
    const f = existingProfile();
    const editor = f.componentInstance;
    editor.openUpload('profile_media_id');
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    editor.uploadPanel()!.upload.file.set(new File(['image'], 'photo.png', { type: 'image/png' }));
    editor.uploadPanel()!.upload.stage.set('completed');
    expect(editor.uploadPending()).toBe(false);
    expect(editor.canLeave()).toBe(true);
  });
  it('loads only the photo and preserves a historical CV association without requesting it', () => {
    const f = TestBed.createComponent(ProfilePage);
    f.detectChanges();
    http
      .expectOne(base + '/profile')
      .flush({ ...profile, profile_media_id: 'photo', cv_media_id: 'cv' });
    http.expectOne(base + '/media/photo').flush({ ...asset(), id: 'photo' });
    http.expectNone(base + '/media/cv');
    expect(f.componentInstance.assets().profile_media_id?.id).toBe('photo');
    expect(f.componentInstance.form.controls.cv_media_id.value).toBe('cv');
    expect(f.componentInstance.mediaError()).toBe('');
    expect(f.componentInstance.body().cv_media_id).toBe('cv');
    expect(f.componentInstance.mediaBusy()).toBe(false);
  });
  it('normalizes empty optional profile text to null and trims contact values', () => {
    const editor = existingProfile().componentInstance;
    editor.form.patchValue({
      professional_title: '  ',
      biography: '  ',
      phone: '  +51 123  ',
      location: ' Lima ',
    });
    expect(editor.body()).toMatchObject({
      professional_title: null,
      biography: null,
      phone: '+51 123',
      location: 'Lima',
    });
  });
  function socials() {
    const f = TestBed.createComponent(SocialLinks);
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([social]));
    return f;
  }
  function settings(rows: unknown[] = []) {
    const f = TestBed.createComponent(SettingsPage);
    f.detectChanges();
    http.expectOne(base + '/site-settings').flush(rows);
    return f;
  }
  it('opens social create and edit forms in a modal and closes clean drafts on Escape', async () => {
    const f = socials();
    f.componentInstance.open('new');
    f.detectChanges();
    await f.whenStable();
    const dialog: HTMLDialogElement = f.nativeElement.querySelector(
      'app-project-edit-modal dialog',
    );
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('form')).not.toBeNull();
    expect(dialog.textContent).toContain('Nuevo enlace social');
    expect(dialog.textContent).not.toContain('vista previa');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    f.detectChanges();
    expect(f.componentInstance.editing()).toBeNull();
    f.componentInstance.open(social);
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('dialog').textContent).toContain('Editar enlace social');
  });
  it('places the profile save control above its scroll area and keeps photo separate from CV', () => {
    const f = existingProfile();
    f.componentInstance.form.controls.first_name.setValue('Cambio');
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('header #profile-save')?.getAttribute('form')).toBe('profile-form');
    expect(el.querySelector('.profile-content #profile-save')).toBeNull();
    expect(el.querySelector('.photo-section')?.textContent).toContain('512 × 512 px');
    expect(el.querySelector('.photo-section #profile-first_name')).toBeNull();
    expect(el.querySelector('.photo-section')?.textContent).not.toContain('Seleccionar fotografía');
    expect(el.querySelector('#profile-photo-file')?.hasAttribute('hidden')).toBe(true);
  });
  it('saves WhatsApp-only changes from the header without rewriting the profile', async () => {
    const f = existingProfile();
    f.detectChanges();
    const whatsapp = { ...social, platform: 'WhatsApp', url: 'https://wa.me/51987654321' };
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([whatsapp]));
    const editor = f.componentInstance.social()!;
    editor.whatsappForm.controls.message.setValue('Hola');
    editor.whatsappForm.markAsDirty();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.whatsapp-section button[type=submit]')).toBeNull();
    f.nativeElement.querySelector('#profile-save').click();
    const request = http.expectOne(base + '/profile/social-links/l');
    expect(request.request.body.url).toBe('https://wa.me/51987654321?text=Hola');
    request.flush({ ...whatsapp, url: request.request.body.url });
    await Promise.resolve();
    http.expectNone(base + '/profile');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#profile-save')).toBeNull();
    expect(f.componentInstance.notice()).toBe('Perfil guardado.');
  });
  it('saves profile and WhatsApp changes through the same header action', async () => {
    const f = existingProfile();
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const editor = f.componentInstance;
    editor.form.controls.location.setValue('Lima');
    editor.social()!.whatsappForm.controls.phone.setValue('987654321');
    editor.social()!.whatsappForm.markAsDirty();
    editor.save();
    editor.save();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ ...social, platform: 'WhatsApp', url: 'https://wa.me/51987654321' });
    await Promise.resolve();
    const request = http.expectOne(base + '/profile');
    expect(request.request.body.location).toBe('Lima');
    request.flush({ ...profile, location: 'Lima' });
    expect(editor.saving()).toBe(false);
  });
  it('keeps both drafts when saving WhatsApp from the header fails', async () => {
    const f = existingProfile();
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const editor = f.componentInstance;
    editor.form.controls.location.setValue('Lima');
    editor.social()!.whatsappForm.controls.phone.setValue('987654321');
    editor.social()!.whatsappForm.markAsDirty();
    editor.save();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ detail: 'Failure' }, { status: 500, statusText: 'Error' });
    await Promise.resolve();
    http.expectNone(base + '/profile');
    expect(editor.form.controls.location.value).toBe('Lima');
    expect(editor.social()!.hasChanges()).toBe(true);
    expect(editor.form.enabled).toBe(true);
    expect(editor.error()).toContain('WhatsApp');
  });
  it('shows save only for actual profile changes and hides it when the values are restored', () => {
    const f = existingProfile();
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    expect(f.nativeElement.querySelector('#profile-save')).toBeNull();
    f.componentInstance.form.controls.location.setValue('Lima');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#profile-save')).not.toBeNull();
    f.componentInstance.form.controls.location.setValue('');
    f.detectChanges();
    expect(f.nativeElement.querySelector('#profile-save')).toBeNull();
    expect(f.nativeElement.textContent).not.toContain('Seleccionar cv');
  });
  it('profile loading and empty singleton create', () => {
    const f = TestBed.createComponent(ProfilePage);
    f.detectChanges();
    expect(f.componentInstance.state()).toBe('loading');
    http
      .expectOne(base + '/profile')
      .flush({ detail: 'Absent' }, { status: 404, statusText: 'Not found' });
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No hay un perfil');
    expect(f.nativeElement.querySelector('app-social-links')).toBeNull();
    f.componentInstance.form.patchValue({ first_name: 'Ana', last_name: 'López' });
    f.componentInstance.save();
    const r = http.expectOne(base + '/profile');
    expect(r.request.method).toBe('POST');
    r.flush(profile);
  });
  it('loads real profile and updates without duplicate submits', () => {
    const f = existingProfile();
    expect(f.componentInstance.form.controls.first_name.value).toBe('Ana');
    expect(f.componentInstance.form.pristine).toBe(true);
    f.componentInstance.form.controls.biography.setValue('Nueva biografía');
    f.componentInstance.save();
    f.componentInstance.save();
    const r = http.expectOne(base + '/profile');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body.biography).toBe('Nueva biografía');
    r.flush({ ...profile, biography: 'Nueva biografía' });
    expect(f.componentInstance.notice()).toContain('guardado');
  });
  it('clears the profile save confirmation after three seconds', () => {
    vi.useFakeTimers();
    try {
      const editor = existingProfile().componentInstance;
      editor.form.controls.first_name.setValue('Cambio');
      editor.save();
      http.expectOne(base + '/profile').flush({ ...profile, first_name: 'Cambio' });
      vi.advanceTimersByTime(2999);
      for (const request of http.match((r) => r.url === base + '/profile/social-links')) {
        request.flush(page([]));
      }
      expect(editor.notice()).toBe('Perfil guardado.');
      vi.advanceTimersByTime(1);
      expect(editor.notice()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });
  for (const status of [422, 409, 0])
    it('profile preserves form on ' + status, () => {
      const f = existingProfile();
      f.componentInstance.form.controls.first_name.setValue('Cambio');
      f.componentInstance.save();
      const r = http.expectOne(base + '/profile');
      if (status === 0) r.error(new ProgressEvent('error'));
      else
        r.flush(
          {
            detail:
              status === 422
                ? [{ loc: ['body', 'first_name'], msg: 'Invalid', type: 'value_error' }]
                : 'Conflict',
          },
          { status, statusText: 'Error' },
        );
      expect(f.componentInstance.form.controls.first_name.value).toBe('Cambio');
      expect(f.componentInstance.saving()).toBe(false);
      if (status === 422)
        expect(f.componentInstance.form.controls.first_name.hasError('backend')).toBe(true);
    });
  it('profile invalid input prevents request', () => {
    const f = existingProfile();
    f.componentInstance.form.controls.first_name.setValue('   ');
    f.componentInstance.save();
    http.expectNone((r) => r.method === 'PATCH');
  });
  it('profile dirty guard allows clean/auth-expired exits and confirms drafts', async () => {
    const e = existingProfile().componentInstance;
    expect(e.canLeave()).toBe(true);
    e.form.markAsDirty();
    const answer = e.canLeave();
    expect(e.draft.confirmation()).toBe(true);
    e.draft.answer(false);
    expect(await answer).toBe(false);
    authenticated = false;
    expect(e.canLeave()).toBe(true);
  });
  for (const key of ['profile_media_id', 'cv_media_id'] as const)
    it('selects and removes ' + key + ' without asset deletion or R2 PUT', () => {
      const e = existingProfile().componentInstance;
      e.picker.set(key);
      e.select(asset(key === 'profile_media_id' ? 'IMAGE' : 'PDF'));
      expect(e.form.controls[key].value).toBe('m');
      e.remove(key);
      expect(e.form.controls[key].value).toBeNull();
      expect(e.form.dirty).toBe(true);
      http.expectNone((r) => r.method === 'DELETE' || r.method === 'PUT');
    });
  it('rejects an incompatible profile photo or CV', () => {
    const e = existingProfile().componentInstance;
    e.picker.set('profile_media_id');
    e.select(asset('PDF'));
    expect(e.form.controls.profile_media_id.value).toBeNull();
    e.picker.set('cv_media_id');
    e.select(asset());
    expect(e.form.controls.cv_media_id.value).toBeNull();
  });
  it('reuses picker for CV with backend-supported PDF and DOCUMENT filters', () => {
    const f = existingProfile();
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    f.componentInstance.picker.set('cv_media_id');
    f.detectChanges();
    const r = http.expectOne((req) => req.url === base + '/media');
    expect(r.request.params.get('type')).toBe('PDF');
    r.flush({ items: [], total: 0, limit: 12, offset: 0 });
    const picker = f.nativeElement.querySelector('app-project-media-picker');
    expect(picker).not.toBeNull();
    const values = Array.from(picker.querySelectorAll('select option')).map(
      (option) => (option as HTMLOptionElement).value,
    );
    expect(values).toEqual(['PDF', 'DOCUMENT']);
  });
  it('profile preview loads authorized content, never a constructed R2 URL', () => {
    const f = TestBed.createComponent(ProfilePage);
    f.detectChanges();
    http.expectOne(base + '/profile').flush({ ...profile, profile_media_id: 'm' });
    http.expectOne(base + '/media/m').flush(asset());
    f.detectChanges();
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    const preview = f.nativeElement.querySelector('app-media-preview');
    expect(preview).not.toBeNull();
    preview.querySelector('button').click();
    http.expectOne(base + '/media/m/content').flush(new Blob(['png']));
    http.expectNone((r) => r.url.includes('r2.'));
  });
  it('social platform is dynamic and URL validation matches HTTP(S) without credentials', () => {
    expect(webUrl(new FormControl('https://custom.example/path'))).toBeNull();
    expect(webUrl(new FormControl('https://user:pass@example.test'))).not.toBeNull();
    expect(webUrl(new FormControl('javascript:alert(1)'))).not.toBeNull();
    const e = socials().componentInstance;
    e.open('new');
    e.form.patchValue({ platform: 'Custom platform', url: 'https://custom.example' });
    e.save();
    const r = http.expectOne(base + '/profile/social-links');
    expect(r.request.body.platform).toBe('Custom platform');
    r.flush(social);
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([social]));
  });
  it('social editing persists username and visibility', () => {
    const e = socials().componentInstance;
    e.open(social);
    expect(e.form.pristine).toBe(true);
    e.form.patchValue({ username: 'architecture', is_visible: false });
    e.save();
    http
      .expectOne(base + '/profile/social-links/l')
      .flush({ ...social, username: 'architecture', is_visible: false });
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([social]));
  });
  it('social delete confirms and reloads only after success', () => {
    const e = socials().componentInstance;
    e.remove(social);
    http.expectNone((r) => r.method === 'DELETE');
    e.answer(false);
    expect(e.items().length).toBe(1);
    e.remove(social);
    e.answer(true);
    http.expectOne(base + '/profile/social-links/l').flush(null);
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([]));
    expect(e.items()).toEqual([]);
  });
  it('social reorder failure reloads authoritative data', () => {
    const e = socials().componentInstance;
    e.items.set([social, { ...social, id: 'second', platform: 'Second', sort_order: 1 }]);
    e.move(1, -1);
    const r = http.expectOne(base + '/profile/social-links/order');
    expect(r.request.body.items[0].id).toBe('second');
    r.flush({ detail: 'Failure' }, { status: 500, statusText: 'Error' });
    http.expectOne((r) => r.url === base + '/profile/social-links').flush(page([social]));
    expect(e.items()).toEqual([social]);
    expect(e.error()).toBeTruthy();
  });
  it('social 422 preserves draft and maps field', () => {
    const e = socials().componentInstance;
    e.open(social);
    e.save();
    http
      .expectOne(base + '/profile/social-links/l')
      .flush(
        { detail: [{ loc: ['body', 'url'], msg: 'Invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Invalid' },
      );
    expect(e.form.controls.url.hasError('backend')).toBe(true);
    expect(e.editing()).toEqual(social);
  });
  it('services create/update with nullable fields and no duplicate submits', () => {
    const e = services().componentInstance;
    e.open('new');
    e.form.patchValue({ name: 'Nuevo', slug: 'nuevo' });
    e.save();
    e.save();
    const r = http.expectOne(base + '/services');
    expect(r.request.body.icon).toBeNull();
    r.flush(service);
    http.expectOne((r) => r.url === base + '/services').flush(page([service]));
    e.open(service);
    e.form.controls.description.setValue('Descripción');
    e.save();
    http.expectOne(base + '/services/s').flush(service);
    http.expectOne((r) => r.url === base + '/services').flush(page([service]));
  });
  it('service visibility PATCH uses actual field', () => {
    const e = services().componentInstance;
    e.visibility(service);
    const r = http.expectOne(base + '/services/s');
    expect(r.request.body).toEqual({ is_visible: false });
    r.flush({ ...service, is_visible: false });
    http
      .expectOne((r) => r.url === base + '/services')
      .flush(page([{ ...service, is_visible: false }]));
    expect(e.items()[0].is_visible).toBe(false);
  });
  it('service order uses final IDs and reloads', () => {
    const e = services().componentInstance;
    e.items.set([service, { ...service, id: 'next', sort_order: 1 }]);
    e.move(1, -1);
    const r = http.expectOne(base + '/services/order');
    expect(r.request.body.items).toEqual([
      { id: 'next', sort_order: 0 },
      { id: 's', sort_order: 1 },
    ]);
    r.flush(null);
    http.expectOne((r) => r.url === base + '/services').flush(page([service]));
  });
  it('service delete failure keeps real record', () => {
    const e = services().componentInstance;
    e.remove(service);
    e.answer(true);
    http
      .expectOne(base + '/services/s')
      .flush({ detail: 'Conflict' }, { status: 409, statusText: 'Conflict' });
    http.expectOne((r) => r.url === base + '/services').flush(page([service]));
    expect(e.items()).toEqual([service]);
  });
  it('service 422 maps slug and preserves input', () => {
    const e = services().componentInstance;
    e.open(service);
    e.form.controls.slug.setValue('new-slug');
    e.save();
    http
      .expectOne(base + '/services/s')
      .flush(
        { detail: [{ loc: ['body', 'slug'], msg: 'Invalid', type: 'value_error' }] },
        { status: 422, statusText: 'Invalid' },
      );
    expect(e.form.controls.slug.value).toBe('new-slug');
    expect(e.form.controls.slug.hasError('backend')).toBe(true);
  });
  it('settings empty state has only title and description forms', () => {
    const f = settings();
    f.detectChanges();
    expect(f.componentInstance.configured()).toEqual([]);
    expect(f.nativeElement.textContent).toContain('Aún no configurado');
    expect(f.nativeElement.querySelectorAll('form').length).toBe(2);
    expect(f.nativeElement.querySelector('#setting-contact')).toBeNull();
  });
  it('recognizes exact known keys and preserves unknown values without editor or write', () => {
    const f = settings([
      { key: 'site_title', value: 'Real title', updated_at: '2026-01-01' },
      { key: 'contact_enabled', value: false, updated_at: '2026-01-01' },
      { key: 'future.setting', value: { doNotOverwrite: true }, updated_at: '2026-01-01' },
    ]);
    expect(f.componentInstance.unknown()).toEqual(['future.setting']);
    expect(f.componentInstance.title.controls.value.value).toBe('Real title');
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('contact_enabled');
    expect(f.nativeElement.querySelector('#setting-contact')).toBeNull();
    f.componentInstance.title.controls.value.setValue('Changed');
    f.componentInstance.save('site_title');
    const r = http.expectOne(base + '/site-settings/site_title');
    expect(r.request.body).toEqual({ value: 'Changed' });
    r.flush({ key: 'site_title', value: 'Changed', updated_at: '2026-01-01' });
    http.expectNone((r) => r.url.includes('future.setting') || r.method === 'DELETE');
    http.expectNone((r) => r.url.includes('/site-settings/contact_enabled'));
  });
  it('saving one setting does not reset a separate dirty setting', () => {
    const e = settings().componentInstance;
    e.title.controls.value.setValue('Title');
    e.description.controls.value.setValue('Unsaved description');
    e.description.markAsDirty();
    e.save('site_title');
    e.save('site_title');
    http
      .expectOne(base + '/site-settings/site_title')
      .flush({ key: 'site_title', value: 'Title', updated_at: '2026-01-01' });
    expect(e.description.controls.value.value).toBe('Unsaved description');
    expect(e.description.dirty).toBe(true);
  });
  it('settings validation rejects HTML and multiline', () => {
    const e = settings().componentInstance;
    e.title.controls.value.setValue('<b>Title</b>');
    e.save('site_title');
    e.description.controls.value.setValue('line\nline');
    e.save('site_description');
    http.expectNone((r) => r.method === 'PUT');
  });
  for (const status of [422, 0])
    it('settings preserve draft after ' + status, () => {
      const e = settings().componentInstance;
      e.title.controls.value.setValue('Draft');
      e.save('site_title');
      const r = http.expectOne(base + '/site-settings/site_title');
      if (status === 0) r.error(new ProgressEvent('error'));
      else
        r.flush(
          { detail: [{ loc: ['body', 'value'], msg: 'Invalid', type: 'value_error' }] },
          { status: 422, statusText: 'Invalid' },
        );
      expect(e.title.controls.value.value).toBe('Draft');
      if (status === 422) expect(e.title.controls.value.hasError('backend')).toBe(true);
    });
  it('settings dirty state uses existing accessible confirmation', async () => {
    const e = settings().componentInstance;
    e.description.markAsDirty();
    const answer = e.canLeave();
    e.draft.answer(true);
    expect(await answer).toBe(true);
  });
});
