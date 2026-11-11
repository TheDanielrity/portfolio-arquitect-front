import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  catchError,
  defer,
  finalize,
  map,
  Observable,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import { AuthApi, AuthUser, LoginCredentials } from './auth-api.service';
import { AuthSession } from './auth-session.service';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly state = signal<AuthStatus>('unknown');
  private readonly currentUser = signal<AuthUser | null>(null);
  readonly status = this.state.asReadonly();
  readonly user = this.currentUser.asReadonly();
  private initialization?: Observable<boolean>;
  private refreshing?: Observable<string>;
  private leaving?: Observable<void>;
  private epoch = 0;
  private loggingOut = false;

  // Rotation preserves this identity; login, logout and expiry invalidate it.
  get sessionVersion(): number {
    return this.epoch;
  }

  initialize(): Observable<boolean> {
    if (this.state() !== 'unknown') return of(this.state() === 'authenticated');
    if (!this.session.isBrowser || !this.session.refreshToken) {
      this.clear();
      return of(false);
    }
    if (!this.initialization) {
      const epoch = this.epoch;
      this.initialization = defer(() => this.refresh()).pipe(
        switchMap(() => this.api.me()),
        tap((user) => {
          if (epoch !== this.epoch) throw new Error('Session operation cancelled');
          this.acceptUser(user);
        }),
        map(() => true),
        catchError(() => {
          if (epoch === this.epoch) this.clear();
          return of(false);
        }),
        finalize(() => {
          this.initialization = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.initialization;
  }

  login(credentials: LoginCredentials): Observable<AuthUser> {
    return defer(() => {
      const epoch = ++this.epoch;
      this.session.clear();
      this.currentUser.set(null);
      this.state.set('unknown');
      return this.api.login(credentials).pipe(
        tap((tokens) => {
          if (epoch !== this.epoch) throw new Error('Session operation cancelled');
          this.session.save(tokens);
        }),
        switchMap(() => this.api.me()),
        tap((user) => {
          if (epoch !== this.epoch) throw new Error('Session operation cancelled');
          this.acceptUser(user);
        }),
        catchError((error: unknown) => {
          if (epoch === this.epoch) this.clear();
          return throwError(() => error);
        }),
      );
    });
  }

  refresh(): Observable<string> {
    if (this.refreshing) return this.refreshing;
    if (this.loggingOut || !this.session.refreshToken)
      return throwError(() => new Error('Session unavailable'));
    const epoch = this.epoch;
    const refreshToken = this.session.refreshToken;
    this.refreshing = defer(() => this.api.refresh({ refresh_token: refreshToken })).pipe(
      timeout(15000),
      map((tokens) => {
        if (epoch !== this.epoch) throw new Error('Session operation cancelled');
        this.session.save(tokens);
        return tokens.access_token;
      }),
      catchError((error: unknown) => {
        if (epoch === this.epoch) this.expire();
        return throwError(() => error);
      }),
      finalize(() => {
        this.refreshing = undefined;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshing;
  }

  logout(): Observable<void> {
    if (this.leaving) return this.leaving;
    this.loggingOut = true;
    // Rotation invalidates the old session: finish it before revoking the latest secret.
    const pending: Observable<string | null> = this.refreshing ?? of(null);
    this.leaving = pending.pipe(
      catchError(() => of(null)),
      switchMap(() => {
        const token = this.session.refreshToken;
        this.clear();
        return token
          ? this.api.logout({ refresh_token: token }).pipe(
              timeout(10000),
              catchError(() => of(undefined)),
            )
          : of(undefined);
      }),
      finalize(() => {
        this.loggingOut = false;
        this.leaving = undefined;
        void this.router.navigateByUrl('/admin/login');
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.leaving;
  }

  expire(expectedVersion = this.epoch): void {
    if (expectedVersion !== this.epoch) return;
    this.clear();
    if (
      this.session.isBrowser &&
      (this.router.url === '/admin' || this.router.url.startsWith('/admin/')) &&
      !this.router.url.startsWith('/admin/login')
    ) {
      void this.router.navigateByUrl('/admin/login');
    }
  }
  private acceptUser(user: AuthUser): void {
    if (!user.is_active) throw new Error('Session unavailable');
    this.currentUser.set(user);
    this.state.set('authenticated');
  }
  private clear(): void {
    this.epoch++;
    this.session.clear();
    this.currentUser.set(null);
    this.state.set('unauthenticated');
  }
}
