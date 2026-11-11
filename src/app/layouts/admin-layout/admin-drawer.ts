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
import { AdminNavigation } from './admin-navigation';

@Component({
  selector: 'app-admin-drawer',
  imports: [AdminNavigation],
  template: `
    <dialog
      #panel
      id="admin-mobile-navigation"
      aria-labelledby="drawer-title"
      (cancel)="cancel($event)"
      (close)="closed()"
    >
      <div class="drawer-header">
        <span id="drawer-title">Portfolio Admin</span>
        <button type="button" (click)="close()" aria-label="Cerrar navegación">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 6 12 12 M6 18 18 6" />
          </svg>
        </button>
      </div>
      <app-admin-navigation />
    </dialog>
  `,
  styleUrl: './admin-drawer.scss',
})
export class AdminDrawer {
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly openState = signal(false);
  readonly opened = this.openState.asReadonly();
  readonly desktop = output<void>();

  constructor() {
    // Browser APIs are confined to this drawer and run only after a browser render.
    afterNextRender(() => {
      const viewport = this.document.defaultView?.matchMedia?.('(min-width: 64rem)');
      if (!viewport) return;
      const changed = (): void => {
        if (viewport.matches && this.opened()) {
          this.close();
          this.desktop.emit();
        }
      };
      viewport.addEventListener('change', changed);
      this.destroyRef.onDestroy(() => viewport.removeEventListener('change', changed));
    });
  }
  open(): void {
    if (this.opened()) return;
    this.panel().nativeElement.showModal();
    this.openState.set(true);
  }
  close(): void {
    if (this.panel().nativeElement.open) this.panel().nativeElement.close();
    this.openState.set(false);
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.close();
  }
  closed(): void {
    // A queued close event may arrive after the dialog has been reopened.
    this.openState.set(this.panel().nativeElement.open);
  }
}
