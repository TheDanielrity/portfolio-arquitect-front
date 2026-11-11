import { Component, computed, inject, signal, RESPONSE_INIT } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { catchError, EMPTY, map, Subject, switchMap, merge, tap } from 'rxjs';
import type { PublicProjectCard, PublicProjectDetail } from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { PublicProjectsApi } from '../projects/public-projects-api';
import { publicProjectError } from '../projects/public-project-collection';
import { ProjectSpotlight } from '../projects/project-spotlight';
import { PublicCover } from '../projects/public-cover';
import { ProjectSectionRenderer } from './project-section-renderer';

export function projectFacts(project: PublicProjectDetail): { label: string; value: string }[] {
  const facts = [
    { label: 'Ubicación', value: project.location },
    { label: 'Año', value: project.year?.toString() },
    { label: 'Area', value: project.area_m2 ? project.area_m2 + ' m²' : null },
    { label: 'Client', value: project.client_name },
    { label: 'Category', value: project.categories.map((category) => category.name).join(' / ') },
    { label: 'Tags', value: project.tags.map((tag) => tag.name).join(' / ') },
  ].filter((fact): fact is { label: string; value: string } => !!fact.value?.trim());
  const seen = new Set(facts.map((fact) => fact.value.trim().toLocaleLowerCase()));
  for (const value of [
    project.area_m2,
    ...project.categories.map((category) => category.name),
    ...project.tags.map((tag) => tag.name),
  ]) {
    if (value?.trim()) seen.add(value.trim().toLocaleLowerCase());
  }
  for (const attribute of project.attributes) {
    const value = attribute.value.trim();
    if (!value || !attribute.label.trim() || seen.has(value.toLocaleLowerCase())) continue;
    facts.push({ label: attribute.label, value: attribute.value });
  }
  return facts;
}

@Component({
  selector: 'app-project-detail',
  imports: [RouterLink, ProjectSpotlight, PublicCover, ProjectSectionRenderer],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.scss',
})
export class ProjectDetail {
  private readonly api = inject(PublicProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly response = inject(RESPONSE_INIT, { optional: true });
  private readonly retries = new Subject<string>();
  readonly project = signal<PublicProjectDetail | null>(null);
  readonly next = signal<PublicProjectCard | null>(null);
  readonly loading = signal(true);
  readonly error = signal<unknown>(null);
  readonly facts = computed(() => (this.project() ? projectFacts(this.project()!) : []));
  readonly missing = computed(
    () => this.error() instanceof ApiError && (this.error() as ApiError).status === 404,
  );
  readonly errorMessage = computed(() => publicProjectError(this.error()));
  readonly extraMedia = computed(() => {
    const project = this.project();
    if (!project) return [];
    const used = new Set([
      project.cover?.url,
      ...project.sections.flatMap((section) => section.media.map((media) => media.asset.url)),
    ]);
    return project.media
      .filter((media) => {
        if (media.role === 'COVER' || used.has(media.asset.url)) return false;
        used.add(media.asset.url);
        return true;
      })
      .map((media) => ({ asset: media.asset, caption: media.asset.description }));
  });
  constructor() {
    merge(this.route.paramMap.pipe(map((params) => params.get('slug') ?? '')), this.retries)
      .pipe(
        tap(() => {
          this.project.set(null);
          this.next.set(null);
          this.error.set(null);
          this.loading.set(true);
        }),
        switchMap((slug) =>
          this.api.detail(slug).pipe(
            tap((project) => {
              this.project.set(project);
              this.loading.set(false);
              this.title.setTitle((project.seo_title || project.title) + ' — Portafolio');
            }),
            switchMap((project) =>
              this.api.nextProject(project.slug).pipe(catchError(() => EMPTY)),
            ),
            catchError((error: unknown) => {
              if (this.response)
                this.response.status =
                  error instanceof ApiError && error.status === 404 ? 404 : 503;
              this.error.set(error);
              this.loading.set(false);
              this.title.setTitle('Proyecto no disponible — Portafolio');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((project) => this.next.set(project));
  }
  retry(): void {
    if (!this.loading()) this.retries.next(this.route.snapshot.paramMap.get('slug') ?? '');
  }
}
