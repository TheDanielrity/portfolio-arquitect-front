import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, expand, map, Observable, reduce, EMPTY, throwError } from 'rxjs';
import { API_BASE_URL } from '../../../core/api/api-config';
import { toApiError } from '../../../core/api/api-error';
import type { Paginated } from '../../../core/api/pagination';
import type {
  AttributeCreate,
  AttributeResponse,
  AttributeUpdate,
  CategoryCreate,
  CategoryResponse,
  ListProjectsApiV1AdminProjectsGetData,
  MediaAttach,
  MediaLinkResponse,
  MediaLinkUpdate,
  PageProjectResponse,
  ProjectCreate,
  ProjectResponse,
  ProjectUpdate,
  Reorder,
  TagCreate,
  TagResponse,
} from '../../../core/api/generated/types.gen';
export type ProjectQuery = NonNullable<ListProjectsApiV1AdminProjectsGetData['query']>;
export type TaxonomyKind = 'categories' | 'tags';
export type Taxon = CategoryResponse | TagResponse;
// Complete paginated collections without silently truncating assignments or relations.
export function allPages<T>(load: (offset: number) => Observable<Paginated<T>>): Observable<T[]> {
  return load(0).pipe(
    expand((page) =>
      page.items.length && page.offset + page.limit < page.total
        ? load(page.offset + page.limit)
        : EMPTY,
    ),
    map((page) => page.items),
    reduce((all: T[], items) => [...all, ...items], []),
  );
}
@Injectable({ providedIn: 'root' })
export class ProjectApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + '/admin';
  private request<T>(method: string, path: string, body?: unknown, query?: object): Observable<T> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== null && value !== '')
        params = params.set(key, String(value));
    return this.http
      .request<T>(method, this.base + path, { body, params, timeout: 15000, transferCache: false })
      .pipe(
        catchError((error: unknown) =>
          throwError(() => (error instanceof HttpErrorResponse ? toApiError(error) : error)),
        ),
      );
  }
  private project(id: string): string {
    return '/projects/' + encodeURIComponent(id);
  }
  list(query: ProjectQuery): Observable<PageProjectResponse> {
    return this.request('GET', '/projects', undefined, query);
  }
  detail(id: string): Observable<ProjectResponse> {
    return this.request('GET', this.project(id));
  }
  create(body: ProjectCreate): Observable<ProjectResponse> {
    return this.request('POST', '/projects', body);
  }
  update(id: string, body: ProjectUpdate): Observable<ProjectResponse> {
    return this.request('PATCH', this.project(id), body);
  }
  orderProjects(body: Reorder): Observable<void> {
    return this.request('PUT', '/projects/order', body);
  }
  delete(id: string): Observable<void> {
    return this.request('DELETE', this.project(id));
  }
  taxons(kind: TaxonomyKind, offset = 0, projectId?: string): Observable<Paginated<Taxon>> {
    return this.request('GET', (projectId ? this.project(projectId) : '') + '/' + kind, undefined, {
      limit: 100,
      offset,
    });
  }
  createCategory(body: CategoryCreate): Observable<CategoryResponse> {
    return this.request('POST', '/categories', body);
  }
  createTag(body: TagCreate): Observable<TagResponse> {
    return this.request('POST', '/tags', body);
  }
  assign(id: string, kind: TaxonomyKind, ids: string[]): Observable<void> {
    return this.request('PUT', this.project(id) + '/' + kind, { ids });
  }
  attributes(id: string, offset = 0): Observable<Paginated<AttributeResponse>> {
    return this.request('GET', this.project(id) + '/attributes', undefined, { limit: 100, offset });
  }
  addAttribute(id: string, body: AttributeCreate): Observable<AttributeResponse> {
    return this.request('POST', this.project(id) + '/attributes', body);
  }
  updateAttribute(id: string, item: string, body: AttributeUpdate): Observable<AttributeResponse> {
    return this.request(
      'PATCH',
      this.project(id) + '/attributes/' + encodeURIComponent(item),
      body,
    );
  }
  deleteAttribute(id: string, item: string): Observable<void> {
    return this.request('DELETE', this.project(id) + '/attributes/' + encodeURIComponent(item));
  }
  media(id: string, offset = 0): Observable<Paginated<MediaLinkResponse>> {
    return this.request('GET', this.project(id) + '/media', undefined, { limit: 100, offset });
  }
  attach(id: string, body: MediaAttach): Observable<MediaLinkResponse> {
    return this.request('POST', this.project(id) + '/media', body);
  }
  updateMedia(id: string, item: string, body: MediaLinkUpdate): Observable<MediaLinkResponse> {
    return this.request('PATCH', this.project(id) + '/media/' + encodeURIComponent(item), body);
  }
  detach(id: string, item: string): Observable<void> {
    return this.request('DELETE', this.project(id) + '/media/' + encodeURIComponent(item));
  }
  cover(id: string, mediaId: string): Observable<MediaLinkResponse> {
    return this.request('PUT', this.project(id) + '/cover', { media_id: mediaId });
  }
  order(id: string, kind: 'attributes' | 'media', body: Reorder): Observable<void> {
    return this.request('PUT', this.project(id) + '/' + kind + '/order', body);
  }
}
