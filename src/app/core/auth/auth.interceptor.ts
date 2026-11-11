import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { AuthService } from './auth.service';
import { AuthSession } from './auth-session.service';

// Exact origin and path boundary, never a string-prefix match across hosts.
export function isProtectedApiUrl(requestUrl: string, baseUrl: string): boolean {
  try {
    const url = new URL(requestUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin || url.username || url.password) return false;
    const path = url.pathname.slice(base.pathname.length);
    return (
      url.pathname.startsWith(base.pathname + '/') &&
      (path === '/auth/me' || path === '/admin' || path.startsWith('/admin/'))
    );
  } catch {
    return false;
  }
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isProtectedApiUrl(request.url, inject(API_BASE_URL))) return next(request);
  const session = inject(AuthSession);
  const auth = inject(AuthService);
  const sessionVersion = auth.sessionVersion;
  const token = session.accessToken;
  if (!token) return next(request);
  const authorized = request.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
    transferCache: false,
  });
  return next(authorized).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        !session.refreshToken ||
        auth.sessionVersion !== sessionVersion
      )
        return throwError(() => error);
      // A delayed 401 for an older JWT must use the already rotated JWT, not rotate again.
      const replacement =
        session.accessToken !== token && session.accessToken
          ? of(session.accessToken)
          : auth.refresh();
      return replacement.pipe(
        switchMap((access) => {
          if (auth.sessionVersion !== sessionVersion) return throwError(() => error);
          return next(
            request.clone({
              setHeaders: { Authorization: `Bearer ${access}` },
              transferCache: false,
            }),
          ).pipe(
            catchError((retryError: unknown) => {
              if (
                retryError instanceof HttpErrorResponse &&
                retryError.status === 401 &&
                session.accessToken === access
              )
                auth.expire(sessionVersion);
              return throwError(() => retryError);
            }),
          );
        }),
      );
    }),
  );
};
