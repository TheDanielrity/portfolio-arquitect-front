import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicCover } from './public-cover';
import type { PublicProjectCard } from '../../../core/api/generated/types.gen';
@Component({
  selector: 'app-project-spotlight',
  imports: [RouterLink, PublicCover],
  templateUrl: './project-spotlight.html',
  styleUrl: './project-spotlight.scss',
})
export class ProjectSpotlight {
  readonly project = input.required<PublicProjectCard>();
  readonly hero = input(false);
  readonly detail = input(false);
}
