import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ADMIN_NAVIGATION } from './admin-navigation.config';

@Component({
  selector: 'app-admin-navigation',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav aria-label="Navegación administrativa">
      <p class="menu-label">ESPACIO DE TRABAJO</p>
      <ul>
        @for (item of items; track item.route) {
          <li>
            <a
              [routerLink]="item.route"
              routerLinkActive="is-active"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              ariaCurrentWhenActive="page"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path [attr.d]="item.iconPath" />
              </svg>
              <span>{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
      <a routerLink="/" class="public-link">
        Ver portafolio
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M7 17 17 7 M7 7h10v10" />
        </svg>
      </a>
    </nav>
  `,
  styleUrl: './admin-navigation.scss',
})
export class AdminNavigation {
  readonly items = ADMIN_NAVIGATION;
}
