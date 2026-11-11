import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { PublicLayout } from './public-layout';
import { PublicHeader } from './public-header';
import { PublicMobileMenu } from './public-mobile-menu';
import { publicRoutes } from '../../features/public/public.routes';
import { PUBLIC_NAVIGATION } from './public-navigation';
import { PublicProjectsApi } from '../../features/public/projects/public-projects-api';
import { emptyPublicApi } from '../../features/public/projects/public-projects.testing';
import { PublicHome } from '../../features/public/home/home';
import { PublicContentApi } from '../../features/public/content/public-content-api';
import { emptyPublicContentApi } from '../../features/public/content/public-content.testing';

describe('Public foundation layout and navigation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: PublicLayout, children: publicRoutes }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PublicProjectsApi, useFactory: emptyPublicApi },
        { provide: PublicContentApi, useFactory: emptyPublicContentApi },
      ],
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLButtonElement>('[autofocus]')?.focus();
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });
  it('renders header, one main, home content, footer and four real anchor destinations', async () => {
    const h = await RouterTestingHarness.create('/');
    const e = h.routeNativeElement!;
    expect(e.querySelector('header nav')).not.toBeNull();
    expect(e.querySelectorAll('main')).toHaveLength(1);
    expect(e.querySelector('footer')).not.toBeNull();
    expect(e.querySelector('main h1')?.textContent).toContain('Espacios.');
    for (const item of PUBLIC_NAVIGATION)
      expect(e.querySelector(item.href.slice(1))).not.toBeNull();
  });
  it('skip link focuses main and does not navigate away', async () => {
    const h = await RouterTestingHarness.create('/');
    const e = h.routeNativeElement!;
    (e.querySelector('.skip-link') as HTMLAnchorElement).click();
    expect(document.activeElement).toBe(e.querySelector('main'));
    expect(TestBed.inject(Router).url).toBe('/');
  });
  it('shows honest absent content and contains no prototype identity or invented cover', () => {
    const f = TestBed.createComponent(PublicHome);
    f.detectChanges();
    expect(f.nativeElement.querySelector('app-studio-section')).toBeNull();
    expect(f.nativeElement.querySelector('app-services-section')).not.toBeNull();
    expect(f.nativeElement.querySelector('app-contact-section')).not.toBeNull();
    expect(f.nativeElement.querySelector('img')).toBeNull();
    expect(f.nativeElement.textContent).not.toMatch(/Mateo|Varela|Casa Bruma|Monolito|Lima|2026/);
  });
  it('does not restore health diagnostics when the retired query is supplied', async () => {
    await RouterTestingHarness.create('/?healthCheck=1');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
  it('uses a transparent hero header and supports a forced solid header', () => {
    const f = TestBed.createComponent(PublicHeader);
    f.componentRef.setInput('overHero', true);
    f.detectChanges();
    expect(f.componentInstance.solid()).toBe(false);
    f.componentRef.setInput('overHero', false);
    f.detectChanges();
    expect(f.componentInstance.solid()).toBe(true);
  });
  it('scroll state changes independently from viewport or route content', async () => {
    const f = TestBed.createComponent(PublicHeader);
    f.componentRef.setInput('overHero', true);
    f.detectChanges();
    await f.whenStable();
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(80);
    window.dispatchEvent(new Event('scroll'));
    expect(f.componentInstance.scrolled()).toBe(true);
    expect(f.componentInstance.solid()).toBe(true);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0);
    window.dispatchEvent(new Event('scroll'));
    expect(f.componentInstance.solid()).toBe(false);
  });
  it('header desktop navigation follows projects, services and contact', () => {
    const f = TestBed.createComponent(PublicHeader);
    f.detectChanges();
    const links = Array.from(
      f.nativeElement.querySelectorAll('.desktop-navigation a'),
    ) as HTMLAnchorElement[];
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Proyectos',
      'Servicios',
      'Contacto ↗',
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(PUBLIC_NAVIGATION.map((i) => i.href));
  });
  it('menu trigger opens accessible dialog and reflects aria-expanded', () => {
    const f = TestBed.createComponent(PublicHeader);
    f.componentRef.setInput('overHero', true);
    f.detectChanges();
    const button = f.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;
    button.focus();
    button.click();
    f.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(f.nativeElement.querySelector('dialog').open).toBe(true);
    expect(f.componentInstance.solid()).toBe(true);
  });
  it('closes a mounted menu on Angular navigation', async () => {
    const f = TestBed.createComponent(PublicHeader);
    f.detectChanges();
    (f.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement).click();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?navigation=test');
    f.detectChanges();
    expect(f.nativeElement.querySelector('dialog').open).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
  it('footer has a back-to-top anchor and no fictional social/email content', async () => {
    const h = await RouterTestingHarness.create('/');
    const footer = h.routeNativeElement!.querySelector('footer')!;
    expect(footer.querySelector('a')?.getAttribute('href')).toBe('#public-main');
    expect(footer.textContent).not.toMatch(/@|instagram|LinkedIn/);
  });
  it('header removes its passive scroll listener on destruction', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const f = TestBed.createComponent(PublicHeader);
    f.detectChanges();
    await f.whenStable();
    f.destroy();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});

describe('Public full-screen menu behavior', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLButtonElement>('[autofocus]')?.focus();
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = '';
  });
  it('starts closed with safe SSR-like markup', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    expect(f.componentInstance.opened()).toBe(false);
    expect(f.nativeElement.querySelector('dialog').open).toBe(false);
  });
  it('opens once, focuses Close, locks scroll, and restores previous overflow', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    const dialog = f.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const open = vi.spyOn(dialog, 'showModal');
    document.body.style.overflow = 'clip';
    f.componentInstance.open();
    f.componentInstance.open();
    expect(open).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Cerrar navegación');
    expect(document.body.style.overflow).toBe('hidden');
    f.componentInstance.close();
    expect(document.body.style.overflow).toBe('clip');
  });
  it('Escape/native cancel closes and restores opener focus', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    f.componentInstance.open();
    const event = new Event('cancel', { cancelable: true });
    f.nativeElement.querySelector('dialog').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(f.componentInstance.opened()).toBe(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('closes after choosing a destination without another navigation system', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    f.componentInstance.open();
    const a = f.nativeElement.querySelector('nav a') as HTMLAnchorElement;
    a.addEventListener('click', (e) => e.preventDefault());
    a.click();
    expect(f.componentInstance.opened()).toBe(false);
    expect(document.body.style.overflow).toBe('');
  });
  it('destroying an open menu unlocks background scroll', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    document.body.style.overflow = 'clip';
    f.componentInstance.open();
    f.destroy();
    expect(document.body.style.overflow).toBe('clip');
  });
  it('native close events cannot reset a reopened dialog', () => {
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    f.componentInstance.open();
    f.componentInstance.closed();
    expect(f.componentInstance.opened()).toBe(true);
    f.componentInstance.close();
    f.componentInstance.closed();
    expect(f.componentInstance.opened()).toBe(false);
  });
  it('desktop resize closes menu and requests visible focus destination', async () => {
    const listeners = new Set<() => void>();
    const viewport = {
      matches: false,
      addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
      removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => viewport),
    });
    const f = TestBed.createComponent(PublicMobileMenu);
    f.detectChanges();
    await f.whenStable();
    const emitted = vi.fn();
    f.componentInstance.desktop.subscribe(emitted);
    f.componentInstance.open();
    viewport.matches = true;
    for (const listener of listeners) listener();
    expect(f.componentInstance.opened()).toBe(false);
    expect(emitted).toHaveBeenCalledOnce();
    f.destroy();
    expect(listeners.size).toBe(0);
  });
});
