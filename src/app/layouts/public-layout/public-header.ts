import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { PublicMobileMenu } from './public-mobile-menu';
import { PUBLIC_NAVIGATION } from './public-navigation';
import { PublicContentState, publicUrl } from '../../features/public/content/public-content-state';
import { PublicMediaDelivery } from '../../features/public/project-detail/public-media-delivery';
import { observeHeroLogoContrast } from './hero-logo-contrast';
import { analyzeLogoImage } from './logo-analysis';
@Component({
  selector: 'app-public-header',
  imports: [RouterLink, PublicMobileMenu],
  templateUrl: './public-header.html',
  styleUrl: './public-header.scss',
})
export class PublicHeader {
  private readonly delivery = inject(PublicMediaDelivery);
  readonly content = inject(PublicContentState);
  readonly failedLogo = signal<string | null>(null);
  readonly logoUrl = computed(() => {
    const media = this.content.profile.value()?.profile_media;
    return media?.type === 'IMAGE' ? publicUrl(this.delivery.url(media)) : null;
  });
  readonly initials = computed(() =>
    this.content
      .name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  );
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private readonly menu = viewChild(PublicMobileMenu);
  private readonly brand = viewChild<ElementRef<HTMLAnchorElement>>('brand');
  readonly overHero = input(false);
  readonly scrolled = signal(false);
  readonly opened = computed(() => this.menu()?.opened() ?? false);
  readonly solid = computed(() => !this.overHero() || this.scrolled() || this.opened());
  readonly darkHero = signal(true);
  readonly logoAnalysis = signal<{ url: string; adaptive: boolean } | null>(null);
  readonly adaptiveLogo = computed(() => {
    const url = this.logoUrl();
    if (!url || this.failedLogo() === url) return true;
    const result = this.logoAnalysis();
    return result?.url === url && result.adaptive;
  });
  readonly whiteLogo = computed(() => this.adaptiveLogo() && !this.solid() && this.darkHero());
  readonly items = PUBLIC_NAVIGATION;
  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(() => this.menu()?.close(false));
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view) return;
      const brand = this.brand()?.nativeElement;
      if (brand) {
        this.destroy.onDestroy(
          observeHeroLogoContrast(this.document, brand, (white) => this.darkHero.set(white)),
        );
      }
      const update = () => this.scrolled.set(view.scrollY > 50);
      update();
      view.addEventListener('scroll', update, { passive: true });
      this.destroy.onDestroy(() => view.removeEventListener('scroll', update));
    });
  }
  openMenu(): void {
    this.menu()?.open();
  }
  async analyzeLogo(): Promise<void> {
    const url = this.logoUrl();
    if (!url) return;
    const adaptive = await analyzeLogoImage(this.document, url);
    if (!this.destroy.destroyed && this.logoUrl() === url) {
      this.logoAnalysis.set({ url, adaptive });
    }
  }
  focusBrand(): void {
    this.brand()?.nativeElement.focus();
  }
}
