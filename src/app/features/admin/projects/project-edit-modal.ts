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
  selector: 'app-project-edit-modal',
  template: `<dialog #dialog aria-labelledby="project-edit-modal-title" (cancel)="cancel($event)">
    <header>
      <h2 id="project-edit-modal-title">{{ title() }}</h2>
      <p>
        {{ description() }}
      </p>
    </header>
    <ng-content />
  </dialog>`,
  styleUrls: ['./project-controls.scss', './project-edit-modal.scss'],
})
export class ProjectEditModal {
  readonly title = input.required<string>();
  readonly description = input(
    'Acepta para revisar la vista previa. Los cambios se guardan al pulsar «Guardar cambios».',
  );
  readonly blocked = input(false);
  readonly cancelled = output<void>();
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    let previous: HTMLElement | null = null;
    afterNextRender(() => {
      previous = this.dialog().nativeElement.ownerDocument.activeElement as HTMLElement | null;
      this.dialog().nativeElement.showModal();
    });
    inject(DestroyRef).onDestroy(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog?.open && typeof dialog.close === 'function') dialog.close();
      if (previous?.isConnected) previous.focus();
    });
  }

  cancel(event: Event): void {
    event.preventDefault();
    if (!this.blocked()) this.cancelled.emit();
  }
}
