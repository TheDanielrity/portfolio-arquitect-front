import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, Injector } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_BASE_URL } from '../api/api-config';
import { toApiError } from '../api/api-error';
import type {
  LoginApiV1AuthLoginPostData,
  MeApiV1AuthMeGetResponses,
  RefreshRequest,
  TokenResponse,
} from '../api/generated/types.gen';

export type LoginCredentials = LoginApiV1AuthLoginPostData['body'];
export type AuthUser = MeApiV1AuthMeGetResponses[200];

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  // Resolve configuration only when making HTTP calls; SSR without a session makes none.
  private readonly injector = inject(Injector);
  private url(path: string): string {
    return `${this.injector.get(API_BASE_URL)}/auth/${path}`;
  }
  login(body: LoginCredentials): Observable<TokenResponse> {
    return this.convert(
      this.http.post<TokenResponse>(this.url('login'), body, {
        transferCache: false,
        timeout: 15000,
      }),
    );
  }
  refresh(body: RefreshRequest): Observable<TokenResponse> {
    return this.convert(
      this.http.post<TokenResponse>(this.url('refresh'), body, {
        transferCache: false,
        timeout: 15000,
      }),
    );
  }
  logout(body: RefreshRequest): Observable<void> {
    return this.convert(
      this.http.post<void>(this.url('logout'), body, { transferCache: false, timeout: 15000 }),
    );
  }
  me(): Observable<AuthUser> {
    return this.convert(
      this.http.get<AuthUser>(this.url('me'), { transferCache: false, timeout: 15000 }),
    );
  }
  private convert<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      catchError((error: unknown) =>
        throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
      ),
    );
  }
}
