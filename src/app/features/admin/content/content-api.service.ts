import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { toApiError } from '../../../core/api/api-error';
import type {
  ProfileCreate,
  ProfileUpdate,
  ProfileResponse,
  SocialCreate,
  SocialUpdate,
  SocialResponse,
  PageSocialResponse,
  ServiceCreate,
  ServiceUpdate,
  ServiceResponse,
  PageServiceResponse,
  SettingKey,
  SettingResponse,
  SettingUpdate,
  Reorder,
} from '../../../core/api/generated/types.gen';
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + '/admin';
  private request<T>(method: string, path: string, body?: unknown, offset?: number): Observable<T> {
    const params =
      offset === undefined
        ? new HttpParams()
        : new HttpParams()
            .set('limit', 100)
            .set('offset', offset)
            .set('sort', 'sort_order')
            .set('direction', 'asc');
    return this.http
      .request<T>(method, this.base + path, { body, params, timeout: 15000, transferCache: false })
      .pipe(
        catchError((e: unknown) =>
          throwError(() => (e instanceof HttpErrorResponse ? toApiError(e) : e)),
        ),
      );
  }
  profile(): Observable<ProfileResponse> {
    return this.request('GET', '/profile');
  }
  createProfile(body: ProfileCreate): Observable<ProfileResponse> {
    return this.request('POST', '/profile', body);
  }
  updateProfile(body: ProfileUpdate): Observable<ProfileResponse> {
    return this.request('PATCH', '/profile', body);
  }
  socials(offset = 0): Observable<PageSocialResponse> {
    return this.request('GET', '/profile/social-links', undefined, offset);
  }
  social(id: string): Observable<SocialResponse> {
    return this.request('GET', '/profile/social-links/' + encodeURIComponent(id));
  }
  createSocial(body: SocialCreate): Observable<SocialResponse> {
    return this.request('POST', '/profile/social-links', body);
  }
  updateSocial(id: string, body: SocialUpdate): Observable<SocialResponse> {
    return this.request('PATCH', '/profile/social-links/' + encodeURIComponent(id), body);
  }
  deleteSocial(id: string): Observable<void> {
    return this.request('DELETE', '/profile/social-links/' + encodeURIComponent(id));
  }
  orderSocials(body: Reorder): Observable<void> {
    return this.request('PUT', '/profile/social-links/order', body);
  }
  services(offset = 0): Observable<PageServiceResponse> {
    return this.request('GET', '/services', undefined, offset);
  }
  service(id: string): Observable<ServiceResponse> {
    return this.request('GET', '/services/' + encodeURIComponent(id));
  }
  createService(body: ServiceCreate): Observable<ServiceResponse> {
    return this.request('POST', '/services', body);
  }
  updateService(id: string, body: ServiceUpdate): Observable<ServiceResponse> {
    return this.request('PATCH', '/services/' + encodeURIComponent(id), body);
  }
  deleteService(id: string): Observable<void> {
    return this.request('DELETE', '/services/' + encodeURIComponent(id));
  }
  orderServices(body: Reorder): Observable<void> {
    return this.request('PUT', '/services/order', body);
  }
  settings(): Observable<SettingResponse[]> {
    return this.request('GET', '/site-settings');
  }
  setting(key: SettingKey): Observable<SettingResponse> {
    return this.request('GET', '/site-settings/' + encodeURIComponent(key));
  }
  putSetting(key: SettingKey, body: SettingUpdate): Observable<SettingResponse> {
    return this.request('PUT', '/site-settings/' + encodeURIComponent(key), body);
  }
}
