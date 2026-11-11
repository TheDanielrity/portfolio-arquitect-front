import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import type { MediaLinkResponse } from '../../../core/api/generated/types.gen';
import { ProjectApi } from './project-api.service';
import { ProjectDraftApi } from './project-draft-api';
import { ProjectDraft } from './project-draft';
import { projectPhotographs } from './project-photographs';
import { ProjectSectionsApi } from './sections/project-sections-api.service';

describe('Existing gallery photographs', () => {
  let http: HttpTestingController;
  const base = 'https://api.test/api/v1/admin/projects/p';
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ProjectDraft,
        { provide: ProjectApi, useClass: ProjectDraftApi },
        { provide: API_BASE_URL, useValue: 'https://api.test/api/v1' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  const page = (items: unknown[]) => ({ items, total: items.length, limit: 100, offset: 0 });
  it('includes historical and hidden galleries once in this project draft and persists only on final save', () => {
    let result: MediaLinkResponse[] = [];
    projectPhotographs(
      TestBed.inject(ProjectApi),
      TestBed.inject(ProjectSectionsApi),
      'p',
    ).subscribe((links) => (result = links));
    http
      .expectOne((r) => r.url === base + '/media')
      .flush(page([{ id: 'existing', media_id: 'one', role: 'GALLERY', sort_order: 3 }]));
    http
      .expectOne((r) => r.url === base + '/sections')
      .flush(
        page([
          { id: 'a', section_type: 'GALLERY', is_visible: true },
          { id: 'b', section_type: 'GALLERY', is_visible: false },
          { id: 'text', section_type: 'TEXT' },
        ]),
      );
    http
      .expectOne((r) => r.url === base + '/sections/a/media')
      .flush(page([{ media_id: 'one' }, { media_id: 'two' }]));
    http
      .expectOne((r) => r.url === base + '/sections/b/media')
      .flush(page([{ media_id: 'two' }, { media_id: 'three' }]));
    expect(result.map((link) => link.media_id)).toEqual(['one', 'two', 'three']);
    expect(result.every((link) => link.role === 'GALLERY')).toBe(true);
    http.expectNone(() => true);
    expect(TestBed.inject(ProjectDraft).pending()).toBe(true);
    TestBed.inject(ProjectDraft).commit().subscribe();
    const first = http.expectOne(base + '/media');
    expect(first.request.body).toEqual({ media_id: 'two', role: 'GALLERY', sort_order: 4 });
    first.flush({ ...result[1], id: 'saved-two' });
    const second = http.expectOne(base + '/media');
    expect(second.request.body).toEqual({ media_id: 'three', role: 'GALLERY', sort_order: 5 });
    second.flush({ ...result[2], id: 'saved-three' });
    expect(TestBed.inject(ProjectDraft).pending()).toBe(false);
  });
  it('does not create relations when all gallery images already belong to photographs', () => {
    projectPhotographs(
      TestBed.inject(ProjectApi),
      TestBed.inject(ProjectSectionsApi),
      'p',
    ).subscribe();
    http
      .expectOne((r) => r.url === base + '/media')
      .flush(page([{ id: 'existing', media_id: 'one', role: 'GALLERY' }]));
    http
      .expectOne((r) => r.url === base + '/sections')
      .flush(page([{ id: 'a', section_type: 'GALLERY' }]));
    http.expectOne((r) => r.url === base + '/sections/a/media').flush(page([{ media_id: 'one' }]));
    expect(TestBed.inject(ProjectDraft).pending()).toBe(false);
    http.expectNone(() => true);
  });
  it('does not associate incomplete results when loading a gallery fails', () => {
    let failed = false;
    projectPhotographs(
      TestBed.inject(ProjectApi),
      TestBed.inject(ProjectSectionsApi),
      'p',
    ).subscribe({ error: () => (failed = true) });
    http.expectOne((r) => r.url === base + '/media').flush(page([]));
    http
      .expectOne((r) => r.url === base + '/sections')
      .flush(page([{ id: 'a', section_type: 'GALLERY' }]));
    http.expectOne((r) => r.url === base + '/sections/a/media').error(new ProgressEvent('error'));
    expect(failed).toBe(true);
    expect(TestBed.inject(ProjectDraft).pending()).toBe(false);
  });
});
