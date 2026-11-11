import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { PUBLIC_NAVIGATION } from './public-navigation';
import { RouterLink } from '@angular/router';
import { PublicContentState } from '../../features/public/content/public-content-state';
@Component({
  selector: 'app-public-mobile-menu',
  imports: [RouterLink],
  templateUrl: './public-mobile-menu.html',
  styleUrl: './public-mobile-menu.scss',
})
export class PublicMobileMenu {
  readonly content = inject(PublicContentState);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  private opener: HTMLElement | null = null;
  private restoreScroll: (() => void) | undefined;
  private readonly state = signal(false);
  readonly opened = this.state.asReadonly();
  readonly desktop = output<void>();
  readonly items = PUBLIC_NAVIGATION;
  constructor() {
    afterNextRender(() => {
      const viewport = this.document.defaultView?.matchMedia?.('(min-width:64rem)');
      if (!viewport) return;
      const changed = () => {
        if (viewport.matches && this.opened()) {
          this.close(false);
          this.desktop.emit();
        }
      };
      viewport.addEventListener('change', changed);
      this.destroy.onDestroy(() => viewport.removeEventListener('change', changed));
    });
    this.destroy.onDestroy(() => this.restoreScroll?.());
  }
  open(): void {
    if (this.opened()) return;
    this.opener =
      this.document.activeElement instanceof HTMLElement ? this.document.activeElement : null;
    const body = this.document.body,
      previous = body.style.overflow;
    this.panel().nativeElement.showModal();
    body.style.overflow = 'hidden';
    this.restoreScroll = () => {
      body.style.overflow = previous;
    };
    this.state.set(true);
  }
  close(restoreFocus = true): void {
    if (this.panel().nativeElement.open) this.panel().nativeElement.close();
    this.state.set(false);
    this.restoreScroll?.();
    this.restoreScroll = undefined;
    if (restoreFocus) this.opener?.focus();
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
  closed(): void {
    if (this.panel().nativeElement.open) return;
    this.state.set(false);
    this.restoreScroll?.();
    this.restoreScroll = undefined;
  }
}
