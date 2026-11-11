import { Component, inject } from '@angular/core';
import { PublicContentState } from './public-content-state';
@Component({
  selector: 'app-contact-section',
  templateUrl: './contact-section.html',
  styleUrl: './contact-section.scss',
})
export class ContactSection {
  readonly content = inject(PublicContentState);
}
