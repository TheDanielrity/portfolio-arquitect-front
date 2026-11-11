import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, map, Observable, reduce } from 'rxjs';
import { PublicHttp } from '../../../core/api/public-http';
import type {
  ListProjectsApiV1PublicProjectsGetData,
  PagePublicProjectCard,
  PagePublicCategory,
  PublicCategory,
  PublicProjectDetail,
  PublicProjectCard,
} from '../../../core/api/generated/types.gen';
export type PublicProjectQuery = NonNullable<ListProjectsApiV1PublicProjectsGetData['query']>;
@Injectable({ providedIn: 'root' })
export class PublicProjectsApi {
  private readonly publicHttp = inject(PublicHttp);
  private get<T>(path: string, query: object): Observable<T> {
    return this.publicHttp.get<T>(path, query);
  }
  list(query: PublicProjectQuery = {}): Observable<PagePublicProjectCard> {
    return this.get('/projects', query);
  }
  detail(slug: string): Observable<PublicProjectDetail> {
    return this.get('/projects/' + encodeURIComponent(slug), {});
  }
  nextProject(slug: string): Observable<PublicProjectCard | null> {
    return this.list({ limit: 100, offset: 0 }).pipe(
      expand((page) =>
        page.items.length && page.offset + page.limit < page.total
          ? this.list({ limit: page.limit, offset: page.offset + page.limit })
          : EMPTY,
      ),
      reduce((all: PublicProjectCard[], page) => [...all, ...page.items], []),
      map((projects) => {
        const index = projects.findIndex((project) => project.slug === slug);
        return index < 0
          ? (projects[0] ?? null)
          : projects[(index + 1) % projects.length]?.slug !== slug
            ? projects[(index + 1) % projects.length]
            : null;
      }),
    );
  }
  featured(query: PublicProjectQuery = {}): Observable<PagePublicProjectCard> {
    return this.get('/featured-projects', query);
  }
  categories(limit = 100, offset = 0): Observable<PagePublicCategory> {
    return this.get('/categories', { limit, offset });
  }
  categoryOptions(): Observable<PublicCategory[]> {
    return this.categories().pipe(
      expand((p) =>
        p.items.length && p.offset + p.limit < p.total
          ? this.categories(p.limit, p.offset + p.limit)
          : EMPTY,
      ),
      map((p) => p.items),
      reduce((all: PublicCategory[], items) => [...all, ...items], []),
    );
  }
}
