import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PublicHeader } from './public-header';
import { PublicContentApi } from '../../features/public/content/public-content-api';
import { PublicContentState } from '../../features/public/content/public-content-state';
import { profileFixture } from '../../features/public/content/public-content.testing';
import { card } from '../../features/public/projects/public-projects.testing';
import { API_BASE_URL } from '../../core/api/api-config';

describe('Public header profile logo', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: 'http://192.168.18.5:4200/api/v1' },
        provideRouter([]),
        {
          provide: PublicContentApi,
          useValue: {
            profile: () => of({ ...profileFixture, profile_media: card.cover }),
            allServices: () => of([]),
            allSocialLinks: () => of([]),
            settings: () => of([]),
          },
        },
      ],
    });
  });
  it('loads a managed profile logo through the same LAN API origin', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.detectChanges();
    const state = TestBed.inject(PublicContentState);
    const path = '/api/v1/public/media/11111111-1111-4111-8111-111111111111/content';
    state.profile.value.set({
      ...profileFixture,
      profile_media: { ...card.cover!, url: 'http://127.0.0.1:8000' + path },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(
      'http://192.168.18.5:4200' + path,
    );
  });
  it('uses the public profile image as a square logo instead of the visible name and title', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.detectChanges();
    const brand = fixture.nativeElement.querySelector('.public-brand') as HTMLAnchorElement;
    const image = brand.querySelector('img')!;
    expect(image.src).toBe(card.cover!.url);
    expect(image.getAttribute('width')).toBe('64');
    expect(image.getAttribute('height')).toBe('64');
    expect(image.getAttribute('loading')).toBe('eager');
    expect(brand.getAttribute('aria-label')).toContain('Test Architect');
    expect(brand.textContent?.trim()).toBe('');
    expect(brand.getAttribute('href')).toBe('/');
  });
  it('keeps a usable home link when no profile image exists', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    TestBed.inject(PublicContentState).profile.value.set(profileFixture);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand-logo')).toBeNull();
    expect(fixture.nativeElement.querySelector('.brand-symbol').textContent).toBe('TA');
  });
  it('adapts the logo over a hero and returns to black when the header becomes solid', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.componentRef.setInput('overHero', true);
    fixture.componentInstance.logoAnalysis.set({ url: card.cover!.url, adaptive: true });
    fixture.componentInstance.darkHero.set(true);
    fixture.detectChanges();
    const brand = fixture.nativeElement.querySelector('.public-brand');
    expect(brand.classList.contains('white-logo')).toBe(true);
    fixture.componentInstance.darkHero.set(false);
    fixture.detectChanges();
    expect(brand.classList.contains('white-logo')).toBe(false);
    fixture.componentInstance.darkHero.set(true);
    fixture.componentInstance.scrolled.set(true);
    fixture.detectChanges();
    expect(brand.classList.contains('white-logo')).toBe(false);
  });
  it('falls back after an image error and shows a replacement logo when the source changes', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.brand-logo').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand-symbol').textContent).toBe('TA');
    TestBed.inject(PublicContentState).profile.value.set({
      ...profileFixture,
      profile_media: { ...card.cover!, url: 'https://example.test/new-logo.png' },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand-logo').src).toBe(
      'https://example.test/new-logo.png',
    );
  });
  it('preserves opaque logos over dark heroes and while a replacement is being analyzed', () => {
    const fixture = TestBed.createComponent(PublicHeader);
    fixture.componentRef.setInput('overHero', true);
    fixture.componentInstance.darkHero.set(true);
    fixture.componentInstance.logoAnalysis.set({ url: card.cover!.url, adaptive: false });
    fixture.detectChanges();
    const brand = fixture.nativeElement.querySelector('.public-brand');
    expect(brand.classList.contains('adaptive-logo')).toBe(false);
    expect(brand.classList.contains('white-logo')).toBe(false);
    fixture.componentInstance.logoAnalysis.set({ url: card.cover!.url, adaptive: true });
    fixture.detectChanges();
    expect(brand.classList.contains('adaptive-logo')).toBe(true);
    TestBed.inject(PublicContentState).profile.value.set({
      ...profileFixture,
      profile_media: { ...card.cover!, url: 'https://example.test/opaque-logo.jpg' },
    });
    fixture.detectChanges();
    expect(brand.classList.contains('adaptive-logo')).toBe(false);
    expect(brand.classList.contains('white-logo')).toBe(false);
  });
});
