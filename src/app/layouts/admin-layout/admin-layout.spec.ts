import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject } from 'rxjs';
import { routes } from '../../app.routes';
import { API_BASE_URL } from '../../core/api/api-config';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDrawer } from './admin-drawer';
import { AdminLayout } from './admin-layout';
import { ADMIN_NAVIGATION } from './admin-navigation.config';

describe('Admin shell and lazy navigation', () => {
  function flushDashboard(): void {
    const requests = TestBed.inject(HttpTestingController).match((r) =>
      r.url.endsWith('/admin/projects'),
    );
    expect(requests).toHaveLength(3);
    for (const request of requests)
      request.flush({
        items: [],
        total: 0,
        offset: 0,
        limit: Number(request.request.params.get('limit')),
      });
  }
  function flushProjects(): void {
    for (const kind of ['categories', 'tags', 'projects'])
      TestBed.inject(HttpTestingController)
        .expectOne((r) => r.url === 'https://api.test/api/v1/admin/' + kind)
        .flush({ items: [], total: 0, offset: 0, limit: kind === 'projects' ? 20 : 100 });
  }
  const user = {
    id: 'id',
    email: 'admin@portfolio.test',
    first_name: 'Ana',
    last_name: 'López',
    is_active: true,
  };
  let authenticated: boolean;
  let currentUser: ReturnType<typeof signal<typeof user | null>>;
  let logoutResult: Subject<void>;
  let logout: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    authenticated = true;
    currentUser = signal<typeof user | null>(user);
    logoutResult = new Subject();
    logout = vi.fn(() => logoutResult);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            initialize: () => of(authenticated),
            user: currentUser.asReadonly(),
            logout,
            status: () => (authenticated ? 'authenticated' : 'unauthenticated'),
          },
        },
      ],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('renders nav, header, main and router outlet with the authenticated user', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    flushDashboard();
    const element = harness.routeNativeElement!;
    expect(element.querySelector('header')).not.toBeNull();
    expect(element.querySelector('nav')).not.toBeNull();
    expect(element.querySelector('main router-outlet')).not.toBeNull();
    expect(element.querySelector('main h1')?.textContent).toBe('Resumen');
    expect(element.querySelector('.user-name')?.textContent).toBe('Ana López');
    expect(element.querySelector('.user-email')?.textContent).toBe(user.email);
    currentUser.set({ ...user, first_name: 'Lucía' });
    harness.detectChanges();
    expect(element.querySelector('.user-name')?.textContent).toBe('Lucía López');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
  it('reuses AuthService logout with loading feedback and duplicate-submit prevention', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    flushDashboard();
    const layout = harness.routeDebugElement!.componentInstance as AdminLayout;
    layout.logout();
    layout.logout();
    harness.detectChanges();
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.logout-button')!;
    expect(logout).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Cerrando');
    logoutResult.next();
    logoutResult.complete();
    harness.detectChanges();
    expect(layout.loggingOut()).toBe(false);
    expect(button.disabled).toBe(false);
  });
  it('focuses main from the skip link without changing routes', async () => {
    const harness = await RouterTestingHarness.create('/admin/projects');
    const element = harness.routeNativeElement!;
    const skip = element.querySelector<HTMLAnchorElement>('.skip-link')!;
    expect(skip.getAttribute('href')).toBe('/admin/projects#admin-main');
    skip.click();
    expect(document.activeElement).toBe(element.querySelector('main'));
    expect(TestBed.inject(Router).url).toBe('/admin/projects');
    flushProjects();
  });
  for (const item of ADMIN_NAVIGATION) {
    it(
      'loads ' + item.route + ' lazily with one active destination and only its feature requests',
      async () => {
        const harness = await RouterTestingHarness.create(item.route);
        const element = harness.routeNativeElement!;
        expect(element.querySelector('main h1')?.textContent).toBe(item.label);
        const links = element.querySelectorAll('.desktop-sidebar nav ul a');
        expect(links).toHaveLength(ADMIN_NAVIGATION.length);
        const active = element.querySelectorAll('.desktop-sidebar [aria-current="page"]');
        expect(active).toHaveLength(1);
        expect(active[0].textContent).toContain(item.label);
        expect(element.querySelector('.context')?.textContent).toContain(item.label);
        expect(document.title).toBe(item.label + ' — Portfolio Admin');
        if (item.path === 'projects') flushProjects();
        else if (item.path === 'taxonomy') {
          for (const kind of ['categories', 'tags'])
            TestBed.inject(HttpTestingController)
              .expectOne((r) => r.url === 'https://api.test/api/v1/admin/' + kind)
              .flush({ items: [], total: 0, offset: 0, limit: 100 });
        } else if (item.path === 'profile')
          TestBed.inject(HttpTestingController)
            .expectOne('https://api.test/api/v1/admin/profile')
            .flush({ detail: 'Not configured' }, { status: 404, statusText: 'Not found' });
        else if (item.path === 'services')
          TestBed.inject(HttpTestingController)
            .expectOne((r) => r.url === 'https://api.test/api/v1/admin/services')
            .flush({ items: [], total: 0, limit: 100, offset: 0 });
        else if (item.path === 'settings')
          TestBed.inject(HttpTestingController)
            .expectOne('https://api.test/api/v1/admin/site-settings')
            .flush([]);
        else if (item.path === '') flushDashboard();
        else TestBed.inject(HttpTestingController).expectNone(() => true);
      },
    );
  }
  it('closes the mobile drawer after navigation and focuses new content', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    flushDashboard();
    const drawer = harness.routeDebugElement!.query(By.directive(AdminDrawer))
      .componentInstance as AdminDrawer;
    const dialog = harness.routeNativeElement!.querySelector('dialog')!;
    Object.defineProperty(dialog, 'showModal', { value: () => dialog.setAttribute('open', '') });
    Object.defineProperty(dialog, 'close', { value: () => dialog.removeAttribute('open') });
    drawer.open();
    expect(drawer.opened()).toBe(true);
    await harness.navigateByUrl('/admin/projects');
    flushProjects();
    expect(drawer.opened()).toBe(false);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(harness.routeNativeElement!.querySelector('main'));
  });
  it('retires the general media route and menu without issuing file mutations', async () => {
    const harness = await RouterTestingHarness.create('/admin/media');
    expect(ADMIN_NAVIGATION.some((item) => item.path === 'media')).toBe(false);
    expect(harness.routeNativeElement!.querySelector('app-media-page')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('main h1')?.textContent).toBe(
      'Página no encontrada',
    );
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
  it('renders an administrative fallback rather than the dashboard for unknown paths', async () => {
    const harness = await RouterTestingHarness.create('/admin/unknown/nested');
    expect(harness.routeNativeElement!.querySelector('main h1')?.textContent).toBe(
      'Página no encontrada',
    );
    expect(
      harness.routeNativeElement!.querySelectorAll('.desktop-sidebar [aria-current="page"]'),
    ).toHaveLength(0);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
  for (const item of ADMIN_NAVIGATION) {
    it('protects direct navigation to ' + item.route, async () => {
      authenticated = false;
      const harness = await RouterTestingHarness.create(item.route);
      expect(TestBed.inject(Router).url).toBe('/admin/login');
      expect(harness.routeNativeElement!.tagName.toLowerCase()).toBe('app-admin-login');
      expect(harness.routeNativeElement!.querySelector('.admin-shell')).toBeNull();
    });
  }
  it('protects child navigation when a session expires while the shell is mounted', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    flushDashboard();
    authenticated = false;
    await harness.navigateByUrl('/admin/settings');
    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(harness.routeNativeElement!.querySelector('.admin-shell')).toBeNull();
  });
  it('does not expose the retired messages module or call its API', async () => {
    const harness = await RouterTestingHarness.create('/admin/messages');
    expect(harness.routeNativeElement!.querySelector('app-messages-page')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('main h1')?.textContent).toContain(
      'Página no encontrada',
    );
    expect(ADMIN_NAVIGATION.some((item) => item.path === 'messages')).toBe(false);
    TestBed.inject(HttpTestingController).expectNone((request) =>
      request.url.includes('contact-messages'),
    );
  });
  it('keeps unauthenticated login outside AdminLayout', async () => {
    authenticated = false;
    const harness = await RouterTestingHarness.create('/admin/login');
    expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('nav')).toBeNull();
  });
  for (const path of [
    '/admin/projects/new',
    '/admin/projects/00000000-0000-0000-0000-000000000000/edit',
  ])
    it('protects project child ' + path, async () => {
      authenticated = false;
      await RouterTestingHarness.create(path);
      expect(TestBed.inject(Router).url).toBe('/admin/login');
      TestBed.inject(HttpTestingController).expectNone(() => true);
    });
  it('lazy-loads the project creation form with only its studio SEO setting', async () => {
    const harness = await RouterTestingHarness.create('/admin/projects/new');
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith('/admin/site-settings/site_title'))
      .flush({ key: 'site_title', value: 'Estudio', updated_at: '2026-01-01' });
    expect(harness.routeNativeElement!.querySelector('main h1')?.textContent).toBe(
      'Crear proyecto',
    );
    expect(harness.routeNativeElement!.querySelector('#project-save')).not.toBeNull();
    expect(
      harness.routeNativeElement!.querySelector('.desktop-sidebar [aria-current="page"]')
        ?.textContent,
    ).toContain('Proyectos');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
