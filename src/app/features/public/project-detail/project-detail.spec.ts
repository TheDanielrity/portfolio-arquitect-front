import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import type {
  PublicProjectDetail,
  PublicSection,
  SectionType,
} from '../../../core/api/generated/types.gen';
import { publicRoutes } from '../public.routes';
import { card } from '../projects/public-projects.testing';
import { PublicProjectsApi } from '../projects/public-projects-api';
import { ProjectDetail, projectFacts } from './project-detail';
import { ProjectSectionRenderer } from './project-section-renderer';
import { PublicSectionMediaView } from './public-section-media';
import { PublicModel } from './public-model';
beforeEach(() => vi.spyOn(PublicModel.prototype, 'webglAvailable').mockReturnValue(false));
afterEach(() => vi.restoreAllMocks());
import { PublicMediaDelivery } from './public-media-delivery';
import { API_BASE_URL } from '../../../core/api/api-config';

export const detail: PublicProjectDetail = {
  ...card,
  description: 'A real narrative.\nSecond paragraph.',
  area_m2: '240.50',
  client_name: 'Public client',
  seo_title: null,
  seo_description: null,
  tags: [{ name: 'Built', slug: 'built' }],
  attributes: [
    { label: 'Material', value: 'Concrete' },
    { label: 'Location duplicate', value: card.location! },
  ],
  media: [],
  sections: [],
};
function apiMock() {
  return {
    detail: vi.fn(() => of(detail)),
    nextProject: vi.fn(() => of({ ...card, slug: 'next-project' })),
  };
}
describe('Public project detail', () => {
  let api: ReturnType<typeof apiMock>;
  beforeEach(() => {
    api = apiMock();
    TestBed.configureTestingModule({
      providers: [provideRouter(publicRoutes), { provide: PublicProjectsApi, useValue: api }],
    });
  });
  it('loads the real slug, facts, narrative and next-project link', async () => {
    const harness = await RouterTestingHarness.create('/projects/' + card.slug);
    expect(api.detail).toHaveBeenCalledWith(card.slug);
    const element = harness.routeNativeElement!;
    expect(element.querySelector('h1')?.textContent).toContain(card.title);
    expect(element.textContent).toContain('240.50 m²');
    expect(element.textContent).toContain('Concrete');
    expect(element.textContent).toContain(detail.description);
    expect(element.querySelector('.next-project')?.getAttribute('href')).toBe(
      '/projects/next-project',
    );
  });
  it.each([404, 401, 403, 500, 0, 429])(
    'handles public status %i without leaking diagnostic text',
    async (status) => {
      api.detail.mockReturnValue(
        throwError(() => new ApiError(status, 'private diagnostic', [], null, 'secret')),
      );
      const harness = await RouterTestingHarness.create('/projects/missing');
      expect(harness.routeNativeElement!.textContent).not.toMatch(/private diagnostic|secret/);
      expect(harness.routeNativeElement!.querySelector('article')).toBeNull();
      expect(api.nextProject).not.toHaveBeenCalled();
      if (status === 404)
        expect(harness.routeNativeElement!.textContent).toContain('Proyecto no encontrado');
    },
  );
  it('recovers a failed detail request through retry', async () => {
    api.detail.mockReturnValueOnce(throwError(() => new ApiError(0, null, [], null, null)));
    const harness = await RouterTestingHarness.create('/projects/' + card.slug);
    (harness.routeNativeElement!.querySelector('button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.querySelector('article')).not.toBeNull();
  });
  it('cancels an obsolete slug request and clears the previous project', async () => {
    const pending = new Subject<PublicProjectDetail>();
    api.detail.mockReturnValueOnce(pending);
    const harness = await RouterTestingHarness.create('/projects/old');
    await harness.navigateByUrl('/projects/new');
    pending.next({ ...detail, title: 'Stale project' });
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement!.textContent).not.toContain('Stale project');
    expect(api.detail).toHaveBeenLastCalledWith('new');
  });
  it('keeps the detail usable when discovery fails', async () => {
    api.nextProject.mockReturnValue(throwError(() => new Error('Discovery unavailable')));
    const harness = await RouterTestingHarness.create('/projects/' + card.slug);
    expect(harness.routeNativeElement!.querySelector('article')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('.next-project')).toBeNull();
  });
  it('preserves section order and excludes standalone media already used by cover or sections', async () => {
    const sections: PublicSection[] = ['QUOTE', 'TEXT'].map((type) => ({
      section_type: type as SectionType,
      title: type,
      content: 'Ordered narrative',
      media: [{ asset: card.cover!, caption: null }],
    }));
    api.detail.mockReturnValue(
      of({
        ...detail,
        sections,
        media: [
          { role: 'COVER', asset: card.cover! },
          { role: 'GALLERY', asset: card.cover! },
        ],
      }),
    );
    const harness = await RouterTestingHarness.create('/projects/' + card.slug);
    const component = harness.routeDebugElement!.componentInstance as ProjectDetail;
    expect(component.extraMedia()).toHaveLength(0);
    expect(
      [...harness.routeNativeElement!.querySelectorAll('app-project-section-renderer h2')].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['QUOTE', 'TEXT']);
  });
  it('renders a project without optional fields, cover or sections', async () => {
    api.detail.mockReturnValue(
      of({
        ...detail,
        cover: null,
        description: null,
        short_description: null,
        area_m2: null,
        client_name: null,
        location: null,
        year: null,
        categories: [],
        tags: [],
        attributes: [],
      }),
    );
    const harness = await RouterTestingHarness.create('/projects/' + card.slug);
    expect(harness.routeNativeElement!.querySelectorAll('.facts')).toHaveLength(0);
    expect(
      harness.routeNativeElement!.querySelectorAll('app-project-section-renderer'),
    ).toHaveLength(0);
    expect(harness.routeNativeElement!.querySelector('h1')?.textContent).toContain(card.title);
  });
  it('preserves different attributes sharing a value and removes only primary-field duplicates', () => {
    const facts = projectFacts({
      ...detail,
      attributes: [...detail.attributes, { label: 'Secondary material', value: 'Concrete' }],
    });
    expect(facts.filter((fact) => fact.value === 'Concrete')).toHaveLength(2);
    expect(facts.some((fact) => fact.label === 'Location duplicate')).toBe(false);
    expect(
      projectFacts({ ...detail, attributes: [{ label: 'Area duplicate', value: '240.50' }] }).some(
        (fact) => fact.label === 'Area duplicate',
      ),
    ).toBe(false);
  });
});

describe('Public section renderer', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'http://localhost:4200/api/v1' }],
    }),
  );
  it('uses the configured public proxy for managed delivery, leaving CDN and signed URLs intact', () => {
    const delivery = TestBed.inject(PublicMediaDelivery);
    const asset = {
      ...card.cover!,
      url: 'http://localhost:8000/api/v1/public/media/11111111-1111-1111-1111-111111111111/content',
    };
    expect(delivery.url(asset)).toBe(
      'http://localhost:4200/api/v1/public/media/11111111-1111-1111-1111-111111111111/content',
    );
    expect(delivery.url(card.cover!)).toBe(card.cover!.url);
    const signed = { ...asset, url: asset.url + '?signature=opaque' };
    expect(delivery.url(signed)).toBe(signed.url);
  });
  it.each<SectionType>(['TEXT', 'IMAGE', 'GALLERY', 'VIDEO', 'MODEL_3D', 'QUOTE', 'SPLIT'])(
    'renders %s through its own editorial presentation',
    (type) => {
      const fixture = TestBed.createComponent(ProjectSectionRenderer);
      const mediaType = type === 'VIDEO' ? 'VIDEO' : type === 'MODEL_3D' ? 'MODEL_3D' : 'IMAGE';
      fixture.componentRef.setInput('section', {
        section_type: type,
        title: 'Section title',
        content: 'Safe plain text',
        media: [
          {
            caption: 'Real caption',
            asset: {
              ...card.cover!,
              type: mediaType,
              mime_type:
                mediaType === 'MODEL_3D'
                  ? 'model/gltf-binary'
                  : mediaType === 'VIDEO'
                    ? 'video/webm'
                    : 'image/jpeg',
            },
          },
        ],
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.section-' + type.toLowerCase())).not.toBeNull();
      if (type === 'QUOTE')
        expect(fixture.nativeElement.querySelector('blockquote')?.textContent).toContain(
          'Safe plain text',
        );
      if (type === 'VIDEO') {
        const video = fixture.nativeElement.querySelector('video');
        expect(video.controls).toBe(true);
        expect(video.autoplay).toBe(false);
        expect(video.preload).toBe('none');
      }
      if (type === 'MODEL_3D')
        expect(fixture.nativeElement.querySelector('model-viewer')).toBeNull();
    },
  );
  it.each<SectionType>(['IMAGE', 'GALLERY', 'VIDEO', 'MODEL_3D', 'SPLIT'])(
    'handles absent media in %s',
    (type) => {
      const fixture = TestBed.createComponent(ProjectSectionRenderer);
      fixture.componentRef.setInput('section', {
        section_type: type,
        title: null,
        content: null,
        media: [],
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toMatch(/no disponibles?/);
    },
  );
  it('fails gracefully on a future type and never interprets content as HTML', () => {
    const fixture = TestBed.createComponent(ProjectSectionRenderer);
    fixture.componentRef.setInput('section', {
      section_type: 'TEXT',
      title: null,
      content: '<script>private()</script>',
      media: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<script>');
    fixture.componentRef.setInput('section', {
      section_type: 'FUTURE',
      title: null,
      content: null,
      media: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no está disponible');
  });
  it('keeps gallery order, captions and intrinsic ratios without duplicate URLs', () => {
    const fixture = TestBed.createComponent(ProjectSectionRenderer);
    const first = { asset: card.cover!, caption: 'First caption' },
      second = {
        asset: { ...card.cover!, url: 'https://delivery.example.test/second' },
        caption: 'Second caption',
      };
    fixture.componentRef.setInput('section', {
      section_type: 'GALLERY',
      title: null,
      content: null,
      media: [second, first, second],
    });
    fixture.detectChanges();
    expect(
      [...fixture.nativeElement.querySelectorAll('figcaption')].map(
        (caption: Element) => caption.textContent,
      ),
    ).toEqual(['Second caption', 'First caption']);
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(2);
  });
  it('handles video playback errors without losing the caption', () => {
    const fixture = TestBed.createComponent(PublicSectionMediaView);
    fixture.componentRef.setInput('media', {
      asset: { ...card.cover!, type: 'VIDEO', mime_type: 'video/webm' },
      caption: 'Film caption',
    });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('video').dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo cargar');
    expect(fixture.nativeElement.textContent).toContain('Film caption');
  });
  it('rejects unsupported model formats and offers retry after model failure', () => {
    const fixture = TestBed.createComponent(PublicModel);
    fixture.componentRef.setInput('media', {
      ...card.cover!,
      type: 'MODEL_3D',
      mime_type: 'model/gltf+json',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    fixture.componentRef.setInput('media', {
      ...card.cover!,
      type: 'MODEL_3D',
      mime_type: 'model/gltf-binary',
    });
    fixture.detectChanges();
    fixture.componentInstance.fail();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reintentar modelo 3D');
  });
});
