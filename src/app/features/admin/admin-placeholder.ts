import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import type { AdminPage } from '../../layouts/admin-layout/admin-navigation.config';

@Component({
  selector: 'app-admin-placeholder',
  imports: [RouterLink],
  template: `
    <section aria-labelledby="admin-page-title">
      <p class="eyebrow">ESPACIO DE TRABAJO</p>
      <h1 id="admin-page-title">{{ page().label }}</h1>
      <p class="description">{{ page().description }}</p>
      @if (page().notFound) {
        <a routerLink="/admin">Volver al resumen</a>
      }
    </section>
  `,
  styles: `
    section {
      max-width: 46rem;
    }
    .eyebrow {
      font-size: 0.65rem;
      letter-spacing: 0.14em;
      font-weight: 600;
      color: var(--admin-muted);
      margin: 0 0 1rem;
    }
    h1 {
      font-size: clamp(1.8rem, 4vw, 2.5rem);
      font-weight: 500;
      letter-spacing: -0.045em;
      line-height: 1.2;
      margin: 0 0 1.25rem;
    }
    .description {
      max-width: 36rem;
      line-height: 1.75;
      color: var(--admin-muted);
      margin: 0;
    }
    a {
      display: inline-block;
      margin-top: 1.5rem;
      color: var(--admin-accent);
      text-underline-offset: 0.25em;
    }
  `,
})
export class AdminPlaceholder {
  readonly page = toSignal(
    inject(ActivatedRoute).data.pipe(map((data) => data['adminPage'] as AdminPage)),
    { requireSync: true },
  );
}
