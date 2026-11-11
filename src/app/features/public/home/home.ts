import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { PublicProjectCard } from '../../../core/api/generated/types.gen';
import { PublicProjectsApi } from '../projects/public-projects-api';
import { PublicProjectCollection } from '../projects/public-project-collection';
import { PublicProjectGrid } from '../projects/public-project-grid';
import { ProjectIndex } from '../projects/project-index';
import { ProjectSpotlight } from '../projects/project-spotlight';
import { ServicesSection } from '../content/services-section';
import { ContactSection } from '../content/contact-section';
@Component({
  selector: 'app-public-home',
  imports: [
    RouterLink,
    PublicProjectGrid,
    ProjectIndex,
    ProjectSpotlight,
    ServicesSection,
    ContactSection,
  ],
  providers: [PublicProjectCollection],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class PublicHome {
  readonly collection = inject(PublicProjectCollection);
  private readonly api = inject(PublicProjectsApi);
  private readonly destroy = inject(DestroyRef);
  readonly featured = signal<PublicProjectCard | null>(null);
  readonly featuredError = signal(false);
  readonly selected = computed(() => this.collection.initialPage()?.items.slice(0, 4) || []);
  readonly hero = computed(
    () =>
      this.featured() ||
      this.collection.initialPage()?.items.find((p) => p.cover?.type === 'IMAGE') ||
      this.collection.initialPage()?.items[0] ||
      null,
  );
  constructor() {
    this.collection.load({ limit: 12, offset: 0 });
    this.loadFeatured();
  }
  loadFeatured(): void {
    this.featuredError.set(false);
    this.api
      .featured({ limit: 1, offset: 0 })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => this.featured.set(p.items[0] || null),
        error: () => this.featuredError.set(true),
      });
  }
}
