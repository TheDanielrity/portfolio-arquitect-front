import { Component, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ProjectConfirm } from '../projects/project-confirm';
// Component-scoped navigation confirmation; no global content state.
@Injectable()
export class ContentDraft {
  private readonly auth = inject(AuthService);
  readonly confirmation = signal(false);
  private resolve?: (answer: boolean) => void;
  constructor() {
    inject(DestroyRef).onDestroy(() => this.resolve?.(false));
  }
  canLeave(dirty: boolean, busy: boolean): boolean | Promise<boolean> {
    if (this.auth.status() !== 'authenticated') return true;
    if (busy || this.resolve) return false;
    if (!dirty) return true;
    this.confirmation.set(true);
    return new Promise((resolve) => (this.resolve = resolve));
  }
  answer(value: boolean): void {
    this.confirmation.set(false);
    this.resolve?.(value);
    this.resolve = undefined;
  }
}
@Component({
  selector: 'app-content-leave-confirm',
  imports: [ProjectConfirm],
  template: `@if (draft.confirmation()) {
    <app-project-confirm
      title="Cambios sin guardar"
      message="Hay cambios sin guardar. ¿Quieres salir y descartarlos?"
      action="Salir sin guardar"
      (answer)="draft.answer($event)"
    />
  }`,
})
export class ContentLeaveConfirm {
  readonly draft = inject(ContentDraft);
}
