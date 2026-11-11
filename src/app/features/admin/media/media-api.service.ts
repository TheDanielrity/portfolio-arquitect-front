import { isPlatformBrowser, XhrFactory } from '@angular/common';
import {
  HttpBackend,
  HttpClient,
  HttpErrorResponse,
  HttpEvent,
  HttpParams,
  HttpXhrBackend,
} from '@angular/common/http';
import { inject, Injectable, InjectionToken, PLATFORM_ID } from '@angular/core';
import { catchError, Observable, throwError, timeout } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { toApiError } from '../../../core/api/api-error';
import type {
  ListMediaApiV1AdminMediaGetData,
  MediaPage,
  MediaResponse,
  MediaUpdate,
  UploadRequest,
  UploadResponse,
} from '../../../core/api/generated/types.gen';

export type MediaQuery = NonNullable<ListMediaApiV1AdminMediaGetData['query']>;
// Browser-only XHR reports actual upload progress. SSR keeps its normal backend.
export const MEDIA_UPLOAD_BACKEND = new InjectionToken<HttpBackend>('MEDIA_UPLOAD_BACKEND', {
  providedIn: 'root',
  factory: () =>
    isPlatformBrowser(inject(PLATFORM_ID))
      ? new HttpXhrBackend(inject(XhrFactory))
      : inject(HttpBackend),
});
@Injectable({ providedIn: 'root' })
export class MediaApi {
  private readonly http = inject(HttpClient);
  // Signed capabilities bypass ALL interceptors, including auth and XSRF.
  private readonly signedHttp = new HttpClient(inject(MEDIA_UPLOAD_BACKEND));
  private readonly base = inject(API_BASE_URL) + '/admin/media';
  private readonly options = { transferCache: false, timeout: 15000 } as const;
  private errors<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
      ),
    );
  }
  list(query: MediaQuery): Observable<MediaPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== null && value !== undefined) params = params.set(key, String(value));
    return this.errors(this.http.get<MediaPage>(this.base, { ...this.options, params }));
  }
  detail(id: string): Observable<MediaResponse> {
    return this.errors(
      this.http.get<MediaResponse>(this.base + '/' + encodeURIComponent(id), this.options),
    );
  }
  update(
    id: string,
    body: Pick<MediaUpdate, 'title' | 'description' | 'alt_text'>,
  ): Observable<MediaResponse> {
    return this.errors(
      this.http.patch<MediaResponse>(this.base + '/' + encodeURIComponent(id), body, this.options),
    );
  }
  delete(id: string): Observable<void> {
    return this.errors(
      this.http.delete<void>(this.base + '/' + encodeURIComponent(id), this.options),
    );
  }
  presign(body: UploadRequest): Observable<UploadResponse> {
    return this.errors(
      this.http.post<UploadResponse>(this.base + '/uploads/presign', body, this.options),
    );
  }
  confirm(uploadId: string): Observable<MediaResponse> {
    return this.errors(
      this.http.post<MediaResponse>(
        this.base + '/uploads/confirm',
        { upload_id: uploadId },
        { ...this.options, timeout: 120000 },
      ),
    );
  }
  cancel(uploadId: string): Observable<void> {
    return this.errors(
      this.http.delete<void>(this.base + '/uploads/' + encodeURIComponent(uploadId), this.options),
    );
  }
  externalContentUrl(asset: MediaResponse, thumbnail = false): string | null {
    if (['r2', 'local'].includes(asset.storage_provider)) return null;
    try {
      const url = new URL(thumbnail ? asset.thumbnail_url || asset.url : asset.url);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  }
  content(id: string): Observable<Blob> {
    return this.errors(
      this.http.get(this.base + '/' + encodeURIComponent(id) + '/content', {
        ...this.options,
        timeout: 120000,
        responseType: 'blob',
        cache: 'no-store',
      }),
    );
  }
  put(authorization: UploadResponse, file: File): Observable<HttpEvent<unknown>> {
    let target: URL;
    try {
      target = new URL(authorization.upload_url);
    } catch {
      return throwError(() => new Error('Invalid upload target'));
    }
    let uploadUrl = authorization.upload_url;
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password)
      return throwError(() => new Error('Invalid upload target'));
    if (authorization.provider === 'local') {
      // Local adapter requires normal JWT auth; only accept its exact contract URL.
      const expected =
        this.base + '/uploads/' + encodeURIComponent(authorization.upload_id) + '/content';
      if (target.pathname !== new URL(expected).pathname || target.search || target.hash)
        return throwError(() => new Error('Invalid local upload target'));
      // Use the configured API origin when development/deployment fronts FastAPI with a proxy.
      uploadUrl = expected;
    }
    const client = authorization.provider === 'r2' ? this.signedHttp : this.http;
    return client
      .put(uploadUrl, file, {
        headers: authorization.headers,
        observe: 'events',
        reportProgress: true,
        withCredentials: false,
        transferCache: false,
        timeout: 600000,
      })
      .pipe(timeout({ each: 120000 }));
  }
}
