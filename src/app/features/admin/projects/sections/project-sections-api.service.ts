import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../../core/api/api-config';
import { toApiError } from '../../../../core/api/api-error';
import type {
  PageSectionResponse,
  PageSectionMediaResponse,
  SectionCreate,
  SectionUpdate,
  SectionResponse,
  SectionMediaInput,
  SectionMediaUpdate,
  SectionMediaResponse,
  Reorder,
} from '../../../../core/api/generated/types.gen';

@Injectable({ providedIn: 'root' })
export class ProjectSectionsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + '/admin/projects/';
  private path(project: string, section?: string): string {
    return (
      this.base +
      encodeURIComponent(project) +
      '/sections' +
      (section ? '/' + encodeURIComponent(section) : '')
    );
  }
  private request<T>(method: string, url: string, body?: unknown, offset?: number): Observable<T> {
    const params =
      offset === undefined
        ? new HttpParams()
        : new HttpParams().set('limit', 100).set('offset', offset);
    return this.http
      .request<T>(method, url, { body, params, timeout: 15000, transferCache: false })
      .pipe(
        catchError((e: unknown) =>
          throwError(() => (e instanceof HttpErrorResponse ? toApiError(e) : e)),
        ),
      );
  }
  list(p: string, offset = 0): Observable<PageSectionResponse> {
    return this.request('GET', this.path(p), undefined, offset);
  }
  detail(p: string, s: string): Observable<SectionResponse> {
    return this.request('GET', this.path(p, s));
  }
  create(p: string, body: SectionCreate): Observable<SectionResponse> {
    return this.request('POST', this.path(p), body);
  }
  update(p: string, s: string, body: SectionUpdate): Observable<SectionResponse> {
    return this.request('PATCH', this.path(p, s), body);
  }
  delete(p: string, s: string): Observable<void> {
    return this.request('DELETE', this.path(p, s));
  }
  order(p: string, body: Reorder): Observable<void> {
    return this.request('PUT', this.path(p) + '/order', body);
  }
  media(p: string, s: string, offset = 0): Observable<PageSectionMediaResponse> {
    return this.request('GET', this.path(p, s) + '/media', undefined, offset);
  }
  attach(p: string, s: string, body: SectionMediaInput): Observable<SectionMediaResponse> {
    return this.request('POST', this.path(p, s) + '/media', body);
  }
  updateMedia(
    p: string,
    s: string,
    m: string,
    body: SectionMediaUpdate,
  ): Observable<SectionMediaResponse> {
    return this.request('PATCH', this.path(p, s) + '/media/' + encodeURIComponent(m), body);
  }
  detach(p: string, s: string, m: string): Observable<void> {
    return this.request('DELETE', this.path(p, s) + '/media/' + encodeURIComponent(m));
  }
  orderMedia(p: string, s: string, body: Reorder): Observable<void> {
    return this.request('PUT', this.path(p, s) + '/media/order', body);
  }
}
