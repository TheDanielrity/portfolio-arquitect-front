import { TestBed } from '@angular/core/testing';
import { API_BASE_URL, normalizeApiBaseUrl } from './api-config';

describe('API configuration', () => {
  it.each(['http://localhost:4200', 'http://192.168.18.5:4200', 'http://127.0.0.1:4310'])(
    'resolves the development proxy from the browser or SSR origin %s',
    (origin) => {
      expect(normalizeApiBaseUrl('/api/v1/', origin)).toBe(origin + '/api/v1');
    },
  );
  it('preserves an explicitly configured absolute API URL', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/api/v1', 'http://192.168.18.5:4200')).toBe(
      'https://api.example.test/api/v1',
    );
  });
  it.each(['//other.test/api/v1', 'api/v1', '/api/v1?token=invalid', '/api/v1#fragment'])(
    'rejects ambiguous relative configuration %s',
    (value) => {
      expect(() => normalizeApiBaseUrl(value, 'http://192.168.18.5:4200')).toThrow();
    },
  );
  it('provides the centrally configured URL without coupling consumers to environments', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: API_BASE_URL, useValue: normalizeApiBaseUrl('http://127.0.0.1:8000/api/v1/') },
      ],
    });
    expect(TestBed.inject(API_BASE_URL)).toBe('http://127.0.0.1:8000/api/v1');
  });

  it('normalizes trailing slashes while preserving a deployment prefix', () => {
    expect(normalizeApiBaseUrl(' https://api.example.test/portfolio/api/v1/// ')).toBe(
      'https://api.example.test/portfolio/api/v1',
    );
  });

  it.each([
    undefined,
    '',
    '/api/v1',
    'ftp://api.example.test',
    'https://user:secret@api.example.test',
    'https://api.example.test?key=secret',
    'https://api.example.test#fragment',
  ])('rejects missing or unsupported API configuration', (value) =>
    expect(() => normalizeApiBaseUrl(value)).toThrow(),
  );
});
