import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError, Observable } from 'rxjs';
import type {
  ContactReceipt,
  PublicProfile,
  PublicService,
  PublicSetting,
  PublicSocialLink,
} from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { PublicContentApi } from './public-content-api';
import { PublicContentState, publicUrl } from './public-content-state';
import { PublicContactForm } from './public-contact-form';
import { StudioSection } from './studio-section';
import { ServicesSection } from './services-section';
import { ContactSection } from './contact-section';
import { PublicWhatsapp } from '../../../layouts/public-layout/public-whatsapp';
import { profileFixture } from './public-content.testing';
import { card } from '../projects/public-projects.testing';

function apiMock() {
  return {
    profile: vi.fn<() => Observable<PublicProfile>>(() => of(profileFixture)),
    allServices: vi.fn<() => Observable<PublicService[]>>(() => of([])),
    allSocialLinks: vi.fn<() => Observable<PublicSocialLink[]>>(() => of([])),
    settings: vi.fn<() => Observable<PublicSetting[]>>(() =>
      of([{ key: 'contact_enabled', value: true }]),
    ),
    contact: vi.fn<() => Observable<ContactReceipt>>(() => of({ detail: 'Message received' })),
  };
}
describe('Public profile, services and contact', () => {
  let api: ReturnType<typeof apiMock>;
  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({ providers: [{ provide: PublicContentApi, useValue: api }] });
  });
  afterEach(() => vi.useRealTimers());
  function form() {
    const fixture = TestBed.createComponent(PublicContactForm);
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({
      name: 'Test sender',
      email: 'sender@example.test',
      phone: '',
      subject: '',
      message: 'An architectural enquiry.',
    });
    return fixture;
  }
  it('renders actual profile name, professional title, biography and contact information', () => {
    const f = TestBed.createComponent(StudioSection);
    f.detectChanges();
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Test Architect');
    expect(f.nativeElement.textContent).toContain(profileFixture.biography);
    expect(f.nativeElement.textContent).toContain(profileFixture.professional_title);
    expect(f.nativeElement.textContent).toContain(profileFixture.location);
    const contact = TestBed.createComponent(ContactSection);
    contact.detectChanges();
    expect(contact.nativeElement.querySelector('a[href^="mailto:"]').textContent).toContain(
      profileFixture.email,
    );
    expect(contact.nativeElement.querySelector('a[href^="tel:"]').textContent).toContain(
      profileFixture.phone,
    );
  });
  it('omits optional absent fields, photo and CV without inserting fictional content', () => {
    api.profile.mockReturnValue(
      of({
        ...profileFixture,
        professional_title: null,
        short_bio: null,
        biography: null,
        profile_media: null,
        cv_media: null,
        email: null,
        phone: null,
        location: null,
      }),
    );
    const f = TestBed.createComponent(StudioSection);
    f.detectChanges();
    expect(f.nativeElement.querySelector('figure')).toBeNull();
    expect(f.nativeElement.querySelector('.profession')).toBeNull();
    expect(f.nativeElement.querySelector('.biography')).toBeNull();
    expect(f.nativeElement.querySelector('a')).toBeNull();
    expect(f.nativeElement.textContent).not.toMatch(/Mateo|experience|Projects|Cities/);
  });
  it('uses the public portrait but omits the CV even when one is associated', () => {
    api.profile.mockReturnValue(
      of({
        ...profileFixture,
        profile_media: card.cover,
        cv_media: {
          ...card.cover!,
          type: 'DOCUMENT',
          mime_type: 'application/pdf',
          url: 'https://api.test/api/v1/public/media/cv/content',
        },
      }),
    );
    const f = TestBed.createComponent(StudioSection);
    f.detectChanges();
    expect(f.nativeElement.querySelector('img').getAttribute('src')).toBe(card.cover!.url);
    expect(f.nativeElement.querySelector('img').getAttribute('loading')).toBe('lazy');
    expect(f.nativeElement.querySelector('img').getAttribute('alt')).toBeTruthy();
    expect(f.nativeElement.querySelector('a[href*="/media/cv/"]')).toBeNull();
  });
  it('shows a safe unavailable portrait when a real image fails', () => {
    api.profile.mockReturnValue(of({ ...profileFixture, profile_media: card.cover }));
    const f = TestBed.createComponent(StudioSection);
    f.detectChanges();
    f.nativeElement.querySelector('img').dispatchEvent(new Event('error'));
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Imagen no disponible');
  });
  it('treats a missing public profile as empty and allows a retry after other failures', () => {
    api.profile.mockReturnValueOnce(throwError(() => new ApiError(404, null, [], null, null)));
    const f = TestBed.createComponent(StudioSection);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('no se ha publicado');
    const state = TestBed.inject(PublicContentState);
    api.profile.mockReturnValueOnce(throwError(() => new Error('private server diagnostics')));
    state.profile.load();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('temporalmente');
    expect(f.nativeElement.textContent).not.toContain('private server diagnostics');
    state.profile.load();
    f.detectChanges();
    expect(f.nativeElement.querySelector('h2').textContent).toContain('Test Architect');
  });
  it('preserves service order and renders short descriptions and expandable narratives', () => {
    api.allServices.mockReturnValue(
      of([
        {
          name: 'Interior',
          slug: 'interior',
          short_description: 'Interior introduction',
          description: 'Full interior narrative',
          icon: null,
        },
        {
          name: 'Architecture',
          slug: 'architecture',
          short_description: null,
          description: null,
          icon: null,
        },
      ]),
    );
    const f = TestBed.createComponent(ServicesSection);
    f.detectChanges();
    expect(
      Array.from(f.nativeElement.querySelectorAll('h3') as NodeListOf<HTMLElement>).map(
        (h) => h.textContent,
      ),
    ).toEqual(['Interior', 'Architecture']);
    expect(f.nativeElement.querySelector('summary')).not.toBeNull();
    expect(f.nativeElement.textContent).toContain('Full interior narrative');
    expect(f.nativeElement.querySelector('img')).toBeNull();
  });
  it('handles empty and failed services without fictional lists', () => {
    api.allServices.mockReturnValueOnce(throwError(() => new Error('internal')));
    const f = TestBed.createComponent(ServicesSection);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('temporalmente');
    TestBed.inject(PublicContentState).services.load();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('no se han publicado');
    expect(f.nativeElement.querySelector('article')).toBeNull();
  });
  it('displays malicious profile and service text literally and drops unsafe external links', () => {
    const malicious = '<script>globalThis.attacked=true</script><img src=x onerror=alert(1)>';
    api.profile.mockReturnValue(
      of({ ...profileFixture, biography: malicious, first_name: malicious }),
    );
    api.allServices.mockReturnValue(
      of([
        {
          name: malicious,
          slug: 'literal',
          short_description: malicious,
          description: malicious,
          icon: null,
        },
      ]),
    );
    api.allSocialLinks.mockReturnValue(
      of([
        { platform: 'Unsafe', url: 'javascript:alert(1)', username: null },
        { platform: 'Social', url: 'https://social.example.test/profile', username: null },
      ]),
    );
    for (const component of [StudioSection, ServicesSection]) {
      const f = TestBed.createComponent(component);
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain(malicious);
      expect(f.nativeElement.querySelector('script, img')).toBeNull();
    }
    const state = TestBed.inject(PublicContentState);
    expect(state.links().map((link) => link.platform)).toEqual(['Social']);
  });
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:password@example.test',
    '/admin/media/file',
    'invalid',
  ]) {
    it('rejects unsafe or non-public URL ' + url.split(':')[0], () =>
      expect(publicUrl(url)).toBeNull(),
    );
  }
  it('uses configured site branding when the public profile is absent', () => {
    api.profile.mockReturnValue(throwError(() => new ApiError(404, null, [], null, null)));
    api.settings.mockReturnValue(of([{ key: 'site_title', value: 'Configured Studio' }]));
    expect(TestBed.inject(PublicContentState).name()).toBe('Configured Studio');
  });
  it('does not reload content for every consumer or navigation', () => {
    for (const component of [StudioSection, ContactSection])
      TestBed.createComponent(component).detectChanges();
    expect(api.profile).toHaveBeenCalledTimes(1);
    expect(api.settings).toHaveBeenCalledTimes(1);
    expect(api.allSocialLinks).toHaveBeenCalledTimes(1);
  });
  it('disables contact when false but keeps email, phone and public social information', () => {
    api.settings.mockReturnValue(of([{ key: 'contact_enabled', value: false }]));
    const f = TestBed.createComponent(ContactSection);
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull();
    expect(f.nativeElement.querySelector('a[href="#contact-form"]')).toBeNull();
    expect(f.nativeElement.querySelector('a[href^="mailto:"]')).not.toBeNull();
    const contactForm = form();
    contactForm.componentInstance.submit();
    expect(api.contact).not.toHaveBeenCalled();
  });
  it('uses the backend enabled default when the setting is absent', () => {
    api.settings.mockReturnValue(of([]));
    expect(TestBed.inject(PublicContentState).contactEnabled()).toBe(true);
  });
  it('keeps contact details without a form or large CTA regardless of settings availability', () => {
    const pending = new Subject<PublicSetting[]>();
    api.settings.mockReturnValueOnce(pending);
    const f = TestBed.createComponent(ContactSection);
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull();
    pending.error(new Error('internal'));
    f.detectChanges();
    expect(f.nativeElement.querySelector('a[href^="mailto:"]')).not.toBeNull();
    expect(f.nativeElement.textContent).not.toContain('A CONVERSATION');
    TestBed.inject(PublicContentState).settings.load();
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull();
  });
  it('shows the configured WhatsApp chat and removes it when the public link is hidden', () => {
    api.allSocialLinks.mockReturnValue(
      of([{ platform: 'WhatsApp', url: 'https://wa.me/51987654321?text=Hola', username: null }]),
    );
    const f = TestBed.createComponent(PublicWhatsapp);
    f.detectChanges();
    const link = f.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://wa.me/51987654321?text=Hola');
    expect(link.target).toBe('_blank');
    expect(link.getAttribute('aria-label')).toContain('WhatsApp');
    api.allSocialLinks.mockReturnValue(of([]));
    TestBed.inject(PublicContentState).socials.load();
    f.detectChanges();
    expect(f.nativeElement.querySelector('a')).toBeNull();
  });
  for (const url of [
    'https://example.com/chat',
    'https://wa.me.evil.test/51987654321',
    'http://wa.me/51987654321',
    'https://wa.me/not-a-number',
  ]) {
    it('does not show the floating chat for an invalid WhatsApp destination: ' + url, () => {
      api.allSocialLinks.mockReturnValue(of([{ platform: 'WhatsApp', url, username: null }]));
      const f = TestBed.createComponent(PublicWhatsapp);
      f.detectChanges();
      expect(f.nativeElement.querySelector('a')).toBeNull();
    });
  }
  it('validates required text, email and every contract length', () => {
    const f = form();
    const e = f.componentInstance;
    e.form.patchValue({ name: ' ', email: 'invalid', message: '' });
    e.submit();
    f.detectChanges();
    expect(api.contact).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('#contact-name-error')).not.toBeNull();
    expect(f.nativeElement.querySelector('#contact-email-error')).not.toBeNull();
    for (const [key, max] of [
      ['name', 150],
      ['email', 320],
      ['phone', 50],
      ['subject', 200],
      ['message', 10000],
    ] as const) {
      e.form.controls[key].setValue('a'.repeat(max + 1));
      expect(e.form.controls[key].invalid).toBe(true);
    }
  });
  it('submits trimmed accepted fields and confirms receipt without simulating an email', () => {
    const f = form();
    const e = f.componentInstance;
    e.form.controls.name.setValue(' Test sender ');
    e.submit();
    f.detectChanges();
    expect(api.contact).toHaveBeenCalledWith({
      name: 'Test sender',
      email: 'sender@example.test',
      phone: null,
      subject: null,
      message: 'An architectural enquiry.',
    });
    expect(f.nativeElement.textContent).toContain('Message received');
    expect(f.nativeElement.querySelector('form')).toBeNull();
    expect(e.form.controls.email.value).toBe('');
    e.reset();
    f.detectChanges();
    expect(f.nativeElement.querySelector('form')).not.toBeNull();
  });
  it('prevents a second submit while the first message is pending or already received', () => {
    const pending = new Subject<ContactReceipt>();
    api.contact.mockReturnValueOnce(pending);
    const f = form();
    const e = f.componentInstance;
    e.submit();
    e.submit();
    f.detectChanges();
    expect(api.contact).toHaveBeenCalledTimes(1);
    expect(f.nativeElement.querySelector('fieldset').disabled).toBe(true);
    pending.next({ detail: 'Message received' });
    pending.complete();
    e.submit();
    expect(api.contact).toHaveBeenCalledTimes(1);
  });
  it('maps 422 fields safely and preserves the entered message for correction', () => {
    api.contact.mockReturnValueOnce(
      throwError(
        () =>
          new ApiError(
            422,
            null,
            [{ loc: ['body', 'email'], msg: 'private internal detail', type: 'value_error' }],
            null,
            null,
          ),
      ),
    );
    const f = form();
    const e = f.componentInstance;
    e.submit();
    f.detectChanges();
    expect(e.form.controls.email.errors).toEqual({ backend: true });
    expect(e.form.controls.message.value).toBe('An architectural enquiry.');
    expect(f.nativeElement.textContent).not.toContain('private internal detail');
    e.form.controls.email.setValue('corrected@example.test');
    expect(e.form.controls.email.valid).toBe(true);
  });
  it('handles 429 Retry-After and prevents submission during the wait', () => {
    vi.useFakeTimers();
    api.contact.mockReturnValueOnce(throwError(() => new ApiError(429, null, [], '2', null)));
    const f = form();
    const e = f.componentInstance;
    e.submit();
    e.submit();
    expect(e.wait()).toBe(2);
    expect(api.contact).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(e.wait()).toBe(0);
    e.submit();
    expect(e.received()).toBe(true);
  });
  for (const status of [0, 400, 403, 413, 500]) {
    it('handles contact failure ' + status + ' without exposing internal details', () => {
      api.contact.mockReturnValueOnce(
        throwError(() => new ApiError(status, 'sensitive diagnostics', [], null, null)),
      );
      const f = form();
      f.componentInstance.submit();
      f.detectChanges();
      expect(f.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
      expect(f.nativeElement.textContent).not.toContain('sensitive diagnostics');
      expect(f.componentInstance.form.controls.message.value).toBe('An architectural enquiry.');
      expect(f.componentInstance.sending()).toBe(false);
      if (status === 400) expect(api.settings).toHaveBeenCalledTimes(2);
    });
  }
});
