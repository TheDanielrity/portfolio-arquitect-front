import { Component, inject, DestroyRef } from '@angular/core';
import { ActivatedRoute, Router, ParamMap } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PublicProjectCollection } from './public-project-collection';
import { PublicProjectGrid } from './public-project-grid';
import { ProjectIndex } from './project-index';
import type { PublicProjectQuery } from './public-projects-api';
export function projectQuery(params: ParamMap): PublicProjectQuery {
  const rawLimit = Number(params.get('limit') || 12),
    rawOffset = Number(params.get('offset') || 0);
  const slug = (value: string | null, max: number) =>
    value && value.length <= max && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) ? value : undefined;
  return {
    limit: Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100 ? rawLimit : 12,
    offset: Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
    category: slug(params.get('category'), 120),
    tag: slug(params.get('tag'), 100),
  };
}
@Component({
  selector: 'app-public-projects-page',
  imports: [PublicProjectGrid, ProjectIndex],
  providers: [PublicProjectCollection],
  template: `<section class="projects-page">
    <p class="label">Portafolio / Proyectos publicados</p>
    <h1>PROYECTOS<span>.</span></h1>
    <app-project-index (changed)="navigate($event)" />
    @if (collection.page()?.items?.length) {
      <div class="project-images" [attr.aria-busy]="collection.loading()">
        <app-public-project-grid
          [projects]="collection.page()!.items"
          [offset]="collection.page()!.offset"
        />
      </div>
    }
  </section>`,
  styles: `
    :host {
      display: block;
    }
    .projects-page {
      padding: 160px var(--public-gutter) var(--public-section-space);
    }
    .label {
      font: 10px var(--public-font-mono);
      text-transform: uppercase;
      letter-spacing: 0.09em;
    }
    h1 {
      font: 500 clamp(54px, 8vw, 120px)/1 var(--public-font-display);
      letter-spacing: -0.045em;
      margin: 24px 0 64px;
      overflow-wrap: anywhere;
    }
    h1 span {
      color: var(--public-primary);
    }
    .project-images {
      margin-top: 80px;
    }
    @media (max-width: 47.999rem) {
      .projects-page {
        padding-top: 136px;
      }
      h1 {
        margin-bottom: 48px;
      }
      .project-images {
        margin-top: 56px;
      }
    }
  `,
})
export class PublicProjectsPage {
  readonly collection = inject(PublicProjectCollection);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((p) => this.collection.load(projectQuery(p)));
  }
  navigate(query: PublicProjectQuery): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { ...query, category: query.category || null, tag: query.tag || null },
      queryParamsHandling: 'merge',
    });
  }
}
