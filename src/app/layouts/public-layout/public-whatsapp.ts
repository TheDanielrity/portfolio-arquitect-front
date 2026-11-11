import { Component, inject } from '@angular/core';
import { PublicContentState } from '../../features/public/content/public-content-state';

@Component({
  selector: 'app-public-whatsapp',
  template: `@if (content.whatsappHref(); as href) {
    <a
      [href]="href"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Conversar por WhatsApp (se abre en una pestaña nueva)"
    >
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M27 15.5a11.5 11.5 0 0 1-17 10.1L4 27l1.5-5.8A11.5 11.5 0 1 1 27 15.5Z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path
          d="m12 9-2 1c-1 5 5 11 10 11l2-3-4-2-1 2c-2-1-4-3-4-4l2-1-3-4Z"
          fill="currentColor"
          stroke="currentColor"
          stroke-linejoin="round"
        />
      </svg>
    </a>
  }`,
  styleUrl: './public-whatsapp.scss',
})
export class PublicWhatsapp {
  readonly content = inject(PublicContentState);
}
