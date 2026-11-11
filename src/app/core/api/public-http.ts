import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, makeStateKey, TransferState, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, Observable, throwError, of, tap } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { ApiError, toApiError } from './api-error';

/** Per-render public snapshots; no shared or persistent cache. */
@Injectable({ providedIn: 'root' })
export class PublicHttp {
  private readonly state = inject(TransferState);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + '/public';
  get<T>(path: string, query: object): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== null && value !== '')
        params = params.set(key, String(value));
    const key = makeStateKey<T | null>(
      'public-projects:' + this.base + path + '?' + params.toString(),
    );
    const errorKey = makeStateKey<{ status: number; retryAfter: string | null }>(
      'public-project-error:' + this.base + path + '?' + params.toString(),
    );
    if (this.browser && this.state.hasKey(errorKey)) {
      const error = this.state.get(errorKey, { status: 500, retryAfter: null });
      this.state.remove(errorKey);
      return throwError(() => new ApiError(error.status, null, [], error.retryAfter, null));
    }
    if (this.browser && this.state.hasKey(key)) {
      const data = this.state.get(key, null);
      this.state.remove(key);
      if (data !== null) return of(data);
    }
    return this.http
      .get<T>(this.base + path, { params, timeout: 10000, transferCache: false })
      .pipe(
        tap((data) => {
          if (!this.browser) this.state.set(key, data);
        }),
        catchError((e: unknown) => {
          const error = e instanceof HttpErrorResponse ? toApiError(e) : e;
          if (!this.browser)
            this.state.set(errorKey, {
              status: error instanceof ApiError ? error.status : 500,
              retryAfter: error instanceof ApiError ? error.retryAfter : null,
            });
          return throwError(() => error);
        }),
      );
  }
}
