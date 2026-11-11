import { ProjectApi } from '../../features/admin/projects/project-api.service';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { AuthService } from './auth.service';

describe('Administrative route guards', () => {
  let authenticated: boolean;
  beforeEach(() => {
    authenticated = false;
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        {
          provide: ProjectApi,
          useValue: { list: () => of({ items: [], total: 0, limit: 3, offset: 0 }) },
        },
        {
          provide: AuthService,
          useValue: { initialize: () => of(authenticated), user: signal(null) },
        },
      ],
    });
  });
  it('redirects unauthenticated /admin to login without mounting private content', async () => {
    const harness = await RouterTestingHarness.create('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-admin-placeholder')).toBeNull();
  });
  it('allows authenticated /admin', async () => {
    authenticated = true;
    const harness = await RouterTestingHarness.create('/admin');
    expect(TestBed.inject(Router).url).toBe('/admin');
    expect(harness.routeNativeElement?.querySelector('app-admin-dashboard')).not.toBeNull();
  });
  it('keeps unauthenticated login accessible without a redirect loop', async () => {
    const harness = await RouterTestingHarness.create('/admin/login');
    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
  });
  it('redirects authenticated login to admin without a loop', async () => {
    authenticated = true;
    await RouterTestingHarness.create('/admin/login');
    expect(TestBed.inject(Router).url).toBe('/admin');
  });
});
