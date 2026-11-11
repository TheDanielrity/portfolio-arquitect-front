import { Component, input } from '@angular/core';
import type { PublicProjectCard } from '../../../core/api/generated/types.gen';
import { ProjectPreview } from './project-preview';
import { PublicReveal } from '../../../shared/public/public-reveal';
@Component({
  selector: 'app-public-project-grid',
  imports: [ProjectPreview, PublicReveal],
  template: `<div class="editorial-grid">
    @for (project of projects(); track project.slug; let i = $index) {
      <app-project-preview
        appPublicReveal
        [project]="project"
        [number]="offset() + i + 1"
        [class.wide]="i % 4 === 0"
        [class.compact]="i % 4 === 1"
        [class.shifted]="i % 4 === 2"
        [class.offset]="i % 4 === 3"
      />
    }
  </div>`,
  styleUrl: './public-project-grid.scss',
})
export class PublicProjectGrid {
  readonly projects = input.required<PublicProjectCard[]>();
  readonly offset = input(0);
}
