import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../../../core/api/api-config';
import type { PublicMedia } from '../../../core/api/generated/types.gen';

@Injectable({ providedIn: 'root' })
export class PublicMediaDelivery {
  private readonly base = new URL(inject(API_BASE_URL));
  url(media: PublicMedia, thumbnail = false): string {
    const source = thumbnail ? media.thumbnail_url || media.url : media.url;
    try {
      const url = new URL(source);
      const prefix = this.base.pathname + '/public/media/';
      const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        !url.search &&
        !url.hash &&
        url.pathname.startsWith(prefix) &&
        new RegExp('^' + uuid + '/content$', 'i').test(url.pathname.slice(prefix.length))
      ) {
        // Keep the supplied public endpoint, but use the configured API proxy origin.
        // Direct CDN URLs and signed object URLs are never rewritten.
        return this.base.origin + url.pathname;
      }
    } catch {
      /* Preserve non-managed URLs for the existing browser error fallback. */
    }
    return source;
  }
}
