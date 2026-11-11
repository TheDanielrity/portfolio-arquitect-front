import { isPlatformBrowser, DOCUMENT } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import type { TokenResponse } from '../api/generated/types.gen';

const STORAGE_KEY = 'portfolio.admin.refresh.v1';

@Injectable({ providedIn: 'root' })
export class AuthSession {
  readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private access: string | null = null;
  private refresh: string | null = null;

  constructor() {
    try {
      this.refresh = this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      /* Memory fallback when storage is blocked. */
    }
    if (this.refresh && !/^[A-Za-z0-9_-]{64}$/.test(this.refresh)) this.clear();
  }
  private get storage(): Storage | undefined {
    return this.isBrowser ? this.document.defaultView?.sessionStorage : undefined;
  }
  get accessToken(): string | null {
    return this.access;
  }
  get refreshToken(): string | null {
    return this.refresh;
  }
  save(tokens: TokenResponse): void {
    this.access = tokens.access_token;
    this.refresh = tokens.refresh_token;
    try {
      this.storage?.setItem(STORAGE_KEY, this.refresh);
    } catch {
      /* Session remains usable in memory. */
    }
  }
  clear(): void {
    this.access = null;
    this.refresh = null;
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      /* Local memory is always cleared. */
    }
  }
}
