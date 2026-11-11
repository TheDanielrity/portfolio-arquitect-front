import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, EMPTY, expand, map, reduce, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { toApiError } from '../../../core/api/api-error';
import { PublicHttp } from '../../../core/api/public-http';
import type {
  ContactCreate,
  ContactReceipt,
  PagePublicService,
  PagePublicSocialLink,
  PublicProfile,
  PublicService,
  PublicSetting,
  PublicSocialLink,
} from '../../../core/api/generated/types.gen';

@Injectable({ providedIn: 'root' })
export class PublicContentApi {
  private readonly read = inject(PublicHttp);
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  profile() {
    return this.read.get<PublicProfile>('/profile', {});
  }
  settings() {
    return this.read.get<PublicSetting[]>('/site-settings', {});
  }
  services(limit = 100, offset = 0) {
    return this.read.get<PagePublicService>('/services', { limit, offset });
  }
  socialLinks(limit = 100, offset = 0) {
    return this.read.get<PagePublicSocialLink>('/social-links', { limit, offset });
  }
  allServices() {
    return this.services().pipe(
      expand((page) =>
        page.items.length && page.offset + page.limit < page.total
          ? this.services(page.limit, page.offset + page.limit)
          : EMPTY,
      ),
      map((page) => page.items),
      reduce((all: PublicService[], items) => [...all, ...items], []),
    );
  }
  allSocialLinks() {
    return this.socialLinks().pipe(
      expand((page) =>
        page.items.length && page.offset + page.limit < page.total
          ? this.socialLinks(page.limit, page.offset + page.limit)
          : EMPTY,
      ),
      map((page) => page.items),
      reduce((all: PublicSocialLink[], items) => [...all, ...items], []),
    );
  }
  contact(body: ContactCreate) {
    return this.http
      .post<ContactReceipt>(this.base + '/public/contact', body, {
        timeout: 15000,
        transferCache: false,
      })
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
        ),
      );
  }
}
