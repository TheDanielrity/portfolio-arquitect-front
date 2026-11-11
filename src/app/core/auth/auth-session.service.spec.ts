import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthSession } from './auth-session.service';

describe('SSR-safe session persistence', () => {
  const key = 'portfolio.admin.refresh.v1';
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
  });
  afterEach(() => sessionStorage.clear());
  it('persists only refresh and restores no access token after reload', () => {
    const session = TestBed.inject(AuthSession);
    session.save({ access_token: 'private-jwt', refresh_token: 'r'.repeat(64), expires_in: 900 });
    expect(sessionStorage.getItem(key)).toBe('r'.repeat(64));
    TestBed.resetTestingModule();
    const restored = TestBed.inject(AuthSession);
    expect(restored.refreshToken).toBe('r'.repeat(64));
    expect(restored.accessToken).toBeNull();
    restored.clear();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('rejects malformed persisted refresh secrets', () => {
    sessionStorage.setItem(key, 'invalid');
    expect(TestBed.inject(AuthSession).refreshToken).toBeNull();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it('falls back to memory when browser storage is denied', () => {
    const view = {
      get sessionStorage(): Storage {
        throw new Error('Storage denied');
      },
    };
    TestBed.overrideProvider(DOCUMENT, { useValue: { defaultView: view } });
    const session = TestBed.inject(AuthSession);
    session.save({ access_token: 'jwt', refresh_token: 'r'.repeat(64), expires_in: 900 });
    expect(session.accessToken).toBe('jwt');
    session.clear();
    expect(session.refreshToken).toBeNull();
  });
  it('does not touch defaultView during SSR', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    TestBed.overrideProvider(DOCUMENT, {
      useValue: {
        get defaultView(): never {
          throw new Error('Browser access');
        },
      },
    });
    const session = TestBed.inject(AuthSession);
    session.save({ access_token: 'jwt', refresh_token: 'r'.repeat(64), expires_in: 900 });
    session.clear();
    expect(session.refreshToken).toBeNull();
  });
});
