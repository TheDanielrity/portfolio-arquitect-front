import { signal } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { of } from 'rxjs';
import { AuthService } from './core/auth/auth.service';
import { appConfig } from './app.config';
import { PublicProjectsApi } from './features/public/projects/public-projects-api';
import { emptyPublicApi } from './features/public/projects/public-projects.testing';
import { routes } from './app.routes';

describe('Application foundation', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        { provide: PublicProjectsApi, useFactory: emptyPublicApi },
        { provide: AuthService, useValue: { initialize: () => of(true), user: signal(null) } },
      ],
    });
  });

  it('creates the application', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeInstanceOf(App);
  });

  it('renders the public route within its layout', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('main h1')?.textContent).toContain(
      'Espacios.',
    );
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-public-layout');
  });

  it('renders the admin route within its layout', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    expect(harness.routeNativeElement?.querySelector('main h1')?.textContent).toBe('Resumen');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-admin-layout');
  });

  it('navigates between layouts without keeping the previous page mounted', async () => {
    const harness = await RouterTestingHarness.create('/');
    await harness.navigateByUrl('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin');
    expect(harness.routeNativeElement?.querySelector('app-public-home')).toBeNull();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.querySelector('app-admin-placeholder')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Espacios.');
  });

  it('provides HttpClient through application configuration', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: appConfig.providers });
    expect(TestBed.inject(HttpClient)).toBeInstanceOf(HttpClient);
  });
});
