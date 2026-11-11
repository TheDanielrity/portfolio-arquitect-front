import { Component, inject } from '@angular/core';
import { PublicContentState } from '../../features/public/content/public-content-state';
@Component({
  selector: 'app-public-footer',
  template: `<footer>
    <p>
      {{ content.name() }}
      @if (content.profile.value()?.professional_title; as title) {
        <span>{{ title }}</span>
      }
    </p>
    <nav aria-label="Redes sociales">
      @for (link of content.links(); track link.url) {
        <a [href]="link.url" target="_blank" rel="noopener noreferrer"
          >{{ link.platform }} ↗<span class="sr-only"> (se abre en una pestaña nueva)</span></a
        >
      }
    </nav>
    <a href="#public-main">Volver arriba <span aria-hidden="true">↑</span></a>
  </footer>`,
  styleUrl: './public-footer.scss',
})
export class PublicFooter {
  readonly content = inject(PublicContentState);
}
