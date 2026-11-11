import { Component, inject } from '@angular/core';
import { PublicContentState } from './public-content-state';
import { PublicCover } from '../projects/public-cover';
@Component({
  selector: 'app-studio-section',
  imports: [PublicCover],
  templateUrl: './studio-section.html',
  styleUrl: './studio-section.scss',
})
export class StudioSection {
  readonly content = inject(PublicContentState);
}
