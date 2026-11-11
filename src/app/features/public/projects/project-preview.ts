import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicProjectCard } from '../../../core/api/generated/types.gen';
import { PublicCover } from './public-cover';
@Component({
  selector: 'app-project-preview',
  imports: [RouterLink, PublicCover],
  template: `<a [routerLink]="['/projects', project().slug]" class="preview"
    ><div class="image">
      <app-public-cover [media]="project().cover" [title]="project().title" /><span
        class="affordance"
        >Ver proyecto <span aria-hidden="true">↗</span></span
      >
    </div>
    <div class="caption">
      <span class="number">{{ number().toString().padStart(2, '0') }}</span>
      <div>
        <h3>{{ project().title }}</h3>
        @if (project().categories.length) {
          <p>{{ project().categories[0].name }}</p>
        }
      </div>
      <p class="metadata">
        {{ project().location }}
        @if (project().year !== null) {
          <br /><span>{{ project().year }}</span>
        }
      </p>
    </div></a
  >`,
  styleUrl: './project-preview.scss',
})
export class ProjectPreview {
  readonly project = input.required<PublicProjectCard>();
  readonly number = input(1);
}
