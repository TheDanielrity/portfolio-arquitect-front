import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { PublicCover } from './public-cover';
import { card } from './public-projects.testing';

const path = '/api/v1/public/media/11111111-1111-4111-8111-111111111111/content';
describe('Public image delivery from LAN and production', () => {
  it.each(['http://192.168.18.5:4200', 'https://portfolio.example.test'])(
    'loads managed covers through the configured API origin %s',
    (origin) => {
      TestBed.configureTestingModule({
        providers: [{ provide: API_BASE_URL, useValue: origin + '/api/v1' }],
      });
      const fixture = TestBed.createComponent(PublicCover);
      fixture.componentRef.setInput('media', {
        ...card.cover!,
        url: 'http://127.0.0.1:8000' + path,
        thumbnail_url: null,
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe(origin + path);
    },
  );
  it('rewrites managed thumbnails too, while keeping direct CDN and signed image URLs intact', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'http://192.168.18.5:4200/api/v1' }],
    });
    const fixture = TestBed.createComponent(PublicCover);
    const source = {
      ...card.cover!,
      url: 'http://127.0.0.1:8000' + path,
      thumbnail_url: 'http://localhost:8000' + path,
    };
    fixture.componentRef.setInput('media', source);
    fixture.detectChanges();
    expect(fixture.componentInstance.source()).toBe('http://192.168.18.5:4200' + path);
    fixture.componentRef.setInput('media', card.cover);
    fixture.detectChanges();
    expect(fixture.componentInstance.source()).toBe(card.cover!.thumbnail_url);
    fixture.componentRef.setInput('media', {
      ...source,
      thumbnail_url: 'https://objects.example.test/image?signature=opaque',
    });
    fixture.detectChanges();
    expect(fixture.componentInstance.source()).toBe(
      'https://objects.example.test/image?signature=opaque',
    );
  });
});
