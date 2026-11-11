import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { API_BASE_URL } from '../../core/api/api-config';
import { AdminDashboard } from './dashboard';
import { ProjectCover } from './projects/project-cover';

describe('Administrative redesign uses real backend state', () => {
  let http: HttpTestingController;
  const base = 'https://api.test/api/v1/admin';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function dashboardResponses() {
    const projects = http.match((r) => r.url === base + '/projects');
    expect(projects).toHaveLength(3);
    for (const request of projects)
      request.flush({
        items: [],
        total:
          request.request.params.get('status') === 'PUBLISHED'
            ? 4
            : request.request.params.get('status') === 'DRAFT'
              ? 2
              : 7,
        limit: Number(request.request.params.get('limit')),
        offset: 0,
      });
    http.expectNone((r) => r.url === base + '/contact-messages');
  }
  it('shows no invented totals while loading and then renders exact backend totals', () => {
    const fixture = TestBed.createComponent(AdminDashboard);
    fixture.detectChanges();
    expect(fixture.componentInstance.metrics().every((m) => m.value === null)).toBe(true);
    dashboardResponses();
    fixture.detectChanges();
    expect(fixture.componentInstance.metrics().map((m) => m.value)).toEqual([7, 4, 2]);
    expect(fixture.nativeElement.textContent).not.toContain('Mensajes');
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Online');
  });
  it('avoids duplicate dashboard requests while a refresh is already pending', () => {
    const fixture = TestBed.createComponent(AdminDashboard);
    fixture.componentInstance.load();
    dashboardResponses();
    expect(fixture.componentInstance.loading()).toBe(false);
  });
  it('does not invent a cover URL when a project has no cover', () => {
    const fixture = TestBed.createComponent(ProjectCover);
    fixture.componentRef.setInput('projectId', 'project');
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === base + '/projects/project/media')
      .flush({ items: [], total: 0, limit: 100, offset: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin vista previa');
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    http.expectNone((r) => r.url.includes('cloudflarestorage'));
  });
  it('keeps the cover fallback available after a backend failure', () => {
    const fixture = TestBed.createComponent(ProjectCover);
    fixture.componentRef.setInput('projectId', 'project');
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === base + '/projects/project/media')
      .error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Sin vista previa');
  });
});
