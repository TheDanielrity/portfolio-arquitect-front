import { Component, DestroyRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPreview,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concatMap, finalize, from, Observable, reduce } from 'rxjs';
import type { SectionResponse, SectionType } from '../../../../core/api/generated/types.gen';
import { allPages } from '../project-api.service';
import { ProjectConfirm } from '../project-confirm';
import { ProjectSectionsApi } from './project-sections-api.service';
import { SectionEditor } from './section-editor';
import { SECTION_POLICY, EDITABLE_SECTION_TYPES, sectionError } from './section-policy';
import { ProjectEditModal } from '../project-edit-modal';
import { SectionPreview } from './section-preview';
@Component({
  selector: 'app-project-sections',
  imports: [
    SectionEditor,
    ProjectConfirm,
    ProjectEditModal,
    SectionPreview,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    CdkDropList,
  ],
  templateUrl: './project-sections.html',
  styleUrls: ['../project-controls.scss', './sections.scss'],
})
export class ProjectSections implements OnInit {
  readonly ordering = signal(false);
  readonly dragging = signal(false);
  toggleOrdering(): void {
    if (this.busy() || this.locked() || this.editing() || this.dragging()) return;
    this.ordering.update((value) => !value);
  }
  readonly projectId = input.required<string>();
  readonly locked = input(false);
  private readonly api = inject(ProjectSectionsApi);
  private readonly destroy = inject(DestroyRef);
  readonly editor = viewChild(SectionEditor);
  readonly sections = signal<SectionResponse[]>([]);
  readonly loading = signal(false);
  readonly writing = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly editing = signal<{ section: SectionResponse | null; type: SectionType } | null>(null);
  readonly confirmation = signal<
    { kind: 'delete'; section: SectionResponse } | { kind: 'discard'; action: () => void } | null
  >(null);
  readonly policies = SECTION_POLICY;
  readonly types = EDITABLE_SECTION_TYPES;
  readonly newSectionType = signal<SectionType>('TEXT');
  readonly descriptions: Record<SectionType, string> = {
    TEXT: 'Cuenta la idea o historia del proyecto.',
    IMAGE: 'Muestra una fotografía, render o plano destacado.',
    GALLERY: 'Presenta varias imágenes juntas.',
    VIDEO: 'Incluye un archivo de video compatible.',
    MODEL_3D:
      'Incluye un GLB o un STL sin color de hasta 100 MiB. El GLB convertido también debe caber en 100 MiB. Se conservan coordenadas y orientación, sin asumir unidades físicas.',
    QUOTE: 'Destaca una frase dentro de la historia del proyecto.',
    SPLIT: 'Combina una imagen con un texto.',
  };
  ngOnInit(): void {
    this.load();
  }
  hasChanges(): boolean {
    return this.editor()?.hasChanges() ?? false;
  }
  nextOrder(): number {
    return Math.min(
      2147483647,
      Math.max(-1, ...this.sections().map((section) => section.sort_order)) + 1,
    );
  }
  busy(): boolean {
    return (
      this.loading() ||
      this.writing() ||
      !!this.editor()?.upload.busy ||
      !!this.editor()?.busy() ||
      !!this.editor()?.loading()
    );
  }
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    allPages((offset) => this.api.list(this.projectId(), offset))
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (items) => this.sections.set(items),
        error: (e) => this.error.set(sectionError(e)),
      });
  }
  open(section: SectionResponse | null, type: SectionType): void {
    this.discard(() => this.editing.set({ section, type }));
  }
  cancel(): void {
    this.discard(() => this.editing.set(null));
  }
  private discard(action: () => void): void {
    if (this.busy() || this.locked()) return;
    if (this.hasChanges()) this.confirmation.set({ kind: 'discard', action });
    else action();
  }
  saved(): void {
    this.editing.set(null);
    this.error.set('');
    this.notice.set('Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.');
    this.load();
  }
  private write(request: Observable<unknown>): void {
    if (this.busy() || this.locked()) return;
    this.writing.set(true);
    this.error.set('');
    this.notice.set('');
    request
      .pipe(
        finalize(() => this.writing.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.notice.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
          this.load();
        },
        error: (e) => {
          this.error.set(sectionError(e));
          this.load();
        },
      });
  }
  visibility(section: SectionResponse): void {
    if (this.hasChanges() || this.busy() || this.locked()) return;
    this.editing.set(null);
    this.write(this.api.update(this.projectId(), section.id, { is_visible: !section.is_visible }));
  }
  move(index: number, direction: number): void {
    this.reorder(index, index + direction);
  }
  drop(event: CdkDragDrop<SectionResponse[]>): void {
    if (!this.ordering()) return;
    this.reorder(event.previousIndex, event.currentIndex);
  }
  private reorder(index: number, next: number): void {
    const items = [...this.sections()];
    if (
      index === next ||
      index < 0 ||
      index >= items.length ||
      next < 0 ||
      next >= items.length ||
      this.hasChanges() ||
      this.busy() ||
      this.locked()
    )
      return;
    moveItemInArray(items, index, next);
    this.editing.set(null);
    const order = items.map((s, i) => ({ id: s.id, sort_order: i }));
    const batches = [];
    for (let offset = 0; offset < order.length; offset += 100)
      batches.push(order.slice(offset, offset + 100));
    this.write(
      from(batches).pipe(
        concatMap((items) => this.api.order(this.projectId(), { items })),
        reduce(() => undefined, undefined),
      ),
    );
  }
  remove(section: SectionResponse): void {
    if (!this.busy() && !this.locked())
      this.discard(() => this.confirmation.set({ kind: 'delete', section }));
  }
  answer(accepted: boolean): void {
    const confirmation = this.confirmation();
    this.confirmation.set(null);
    if (!accepted || !confirmation) return;
    if (confirmation.kind === 'discard') {
      this.editing.set(null);
      confirmation.action();
      return;
    }
    this.editing.set(null);
    this.write(this.api.delete(this.projectId(), confirmation.section.id));
  }
}
