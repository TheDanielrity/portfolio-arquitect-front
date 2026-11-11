import { Component, inject } from '@angular/core';
import { PublicContentState } from './public-content-state';
@Component({
  selector: 'app-services-section',
  templateUrl: './services-section.html',
  styleUrl: './services-section.scss',
})
export class ServicesSection {
  readonly content = inject(PublicContentState);
}
