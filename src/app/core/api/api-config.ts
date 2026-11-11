import { inject, InjectionToken, makeStateKey, TransferState } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DOCUMENT } from '@angular/common';

export function normalizeApiBaseUrl(value: string | undefined, origin?: string): string {
  if (!value?.trim()) {
    throw new Error('API_BASE_URL must be configured before making API requests.');
  }
  const configured = value.trim();
  const url =
    configured.startsWith('/') && !configured.startsWith('//') && origin
      ? new URL(configured, origin)
      : new URL(configured);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('API_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.');
  }
  return url.toString().replace(/\/+$/, '');
}

export const PUBLIC_API_CONFIG = makeStateKey<string>('public-api-base-url');
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () =>
    normalizeApiBaseUrl(
      inject(TransferState).get(PUBLIC_API_CONFIG, environment.apiBaseUrl ?? ''),
      inject(DOCUMENT).location?.origin,
    ),
});
