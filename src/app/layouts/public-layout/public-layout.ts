import { DOCUMENT, ViewportScroller } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, viewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { PublicHeader } from './public-header';
import { PublicFooter } from './public-footer';
import { PublicWhatsapp } from './public-whatsapp';
@Component({
  selector: 'app-public-layout',
  imports: [RouterOutlet, PublicHeader, PublicFooter, PublicWhatsapp],
  template: `<div class="public-shell" lang="es">
    <a class="skip-link" href="#public-main" (click)="skip($event)">Saltar al contenido principal</a
    ><app-public-header [overHero]="overHero()" />
    <main #content id="public-main" tabindex="-1"><router-outlet /></main>
    <app-public-footer />
    <app-public-whatsapp />
  </div>`,
  styleUrl: './public-layout.scss',
})
export class PublicLayout {
  constructor() {
    const document = inject(DOCUMENT);
    const scroller = inject(ViewportScroller);
    afterNextRender(() =>
      scroller.setOffset(() => [
        0,
        (document.querySelector('app-public-header header')?.getBoundingClientRect().height ?? 88) +
          24,
      ]),
    );
  }
  private readonly route = inject(ActivatedRoute);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private hasHero(): boolean {
    let route = this.route.snapshot;
    while (route.firstChild) route = route.firstChild;
    return route.data['publicHero'] === true;
  }
  readonly overHero = toSignal(
    inject(Router).events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.hasHero()),
    ),
    { initialValue: this.hasHero() },
  );
  skip(event: Event): void {
    event.preventDefault();
    this.content()?.nativeElement.focus();
  }
}
