import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
@Component({
  selector: 'app-project-confirm',
  template: `<dialog #dialog aria-labelledby="project-confirm-title" (cancel)="cancel($event)">
    <h2 id="project-confirm-title">{{ title() }}</h2>
    <p>{{ message() }}</p>
    <div class="actions">
      <button type="button" autofocus (click)="answer.emit(false)">Cancelar</button
      ><button type="button" class="primary" (click)="answer.emit(true)">{{ action() }}</button>
    </div>
  </dialog>`,
  styleUrl: './project-controls.scss',
})
export class ProjectConfirm {
  readonly title = input('Confirmar acción');
  readonly message = input.required<string>();
  readonly action = input('Confirmar');
  readonly answer = output<boolean>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    const destroy = inject(DestroyRef);
    let previous: HTMLElement | null = null;
    afterNextRender(() => {
      previous = this.dialog().nativeElement.ownerDocument.activeElement as HTMLElement | null;
      this.dialog().nativeElement.showModal();
    });
    destroy.onDestroy(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      if (previous?.isConnected) previous.focus();
    });
  }
  cancel(event: Event): void {
    event.preventDefault();
    this.answer.emit(false);
  }
}
