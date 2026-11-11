import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CdkDrag, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { finalize, forkJoin, Observable, of, switchMap, tap } from 'rxjs';
import type {
  MediaLinkResponse,
  MediaResponse,
  MediaRole,
} from '../../../core/api/generated/types.gen';
import { MediaApi } from '../media/media-api.service';
import { MediaPreview } from '../media/media-preview';
import { allPages, ProjectApi } from './project-api.service';
import { fieldErrors, projectError } from './project-errors';
import { saveOrder } from './project-order';
import { ProjectConfirm } from './project-confirm';
import { ProjectUploadQueue } from './project-upload-queue';
import { mediaTypeLabel, MEDIA_ACCEPT, validateFile } from '../media/media-policy';
import { ProjectEditModal } from './project-edit-modal';
import { projectPhotographs } from './project-photographs';
import { ProjectSectionsApi } from './sections/project-sections-api.service';
@Component({
  selector: 'app-project-media',
  imports: [
    MediaPreview,
    ReactiveFormsModule,
    ProjectConfirm,
    ProjectEditModal,
    CdkDrag,
    CdkDropList,
  ],
  providers: [ProjectUploadQueue],
  templateUrl: './project-media.html',
  styleUrls: ['./project-controls.scss', './project-media.scss'],
})
export class ProjectMedia implements OnInit {
  readonly projectId = input('');
  readonly mode = input<'all' | 'cover' | 'gallery'>('all');
  readonly draftRequested = output<void>();
  readonly queue = inject(ProjectUploadQueue);
  readonly acceptFiles = MEDIA_ACCEPT;
  readonly typeLabel = mediaTypeLabel;
  readonly group = signal<MediaRole>('COVER');
  readonly draggingFiles = signal(false);
  private dragDepth = 0;
  readonly activeGroup = computed(() =>
    this.mode() === 'cover' ? 'COVER' : this.mode() === 'gallery' ? 'GALLERY' : this.group(),
  );
  readonly removing = signal<MediaLinkResponse | null>(null);
  readonly metadataId = signal<string | null>(null);
  readonly pendingSelection = signal<{ files: File[]; role: MediaRole } | null>(null);
  readonly pending = computed(() => this.queue.pending() || !!this.pendingSelection());
  readonly metadata = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    alt_text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20000)],
    }),
  });
  private loadedId = '';
  private completedVersion = 0;
  readonly locked = input(false);
  private readonly api = inject(ProjectApi);
  private readonly sections = inject(ProjectSectionsApi);
  private readonly mediaApi = inject(MediaApi);
  private readonly destroy = inject(DestroyRef);
  readonly links = signal<MediaLinkResponse[]>([]);
  readonly assets = signal<Record<string, MediaResponse>>({});
  readonly coverLink = computed(() => this.links().find((link) => link.role === 'COVER') ?? null);
  readonly coverAsset = computed(() => {
    const link = this.coverLink();
    return link ? (this.assets()[link.media_id] ?? null) : null;
  });
  readonly coverMetadata = new FormGroup({
    alt_text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(255)] }),
  });
  readonly busy = signal(false);
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly roles = [
    { value: 'COVER', label: 'Portada' },
    { value: 'GALLERY', label: 'Fotografías' },
    { value: 'PLAN', label: 'Planos' },
    { value: 'RENDER', label: 'Renders' },
    { value: 'DOCUMENT', label: 'Documentos' },
    { value: 'MODEL', label: 'Modelos 3D' },
  ] as const;
  constructor() {
    let previousGroup = this.activeGroup();
    effect(() => {
      const group = this.activeGroup();
      if (group !== previousGroup) untracked(() => this.cancelMetadata());
      previousGroup = group;
    });
    effect(() => {
      const asset = this.coverAsset();
      untracked(() => this.coverMetadata.reset({ alt_text: asset?.alt_text ?? '' }));
    });
    effect(() => {
      const id = this.projectId();
      if (id && id !== this.loadedId) untracked(() => this.load());
      const pending = this.pendingSelection();
      if (id && pending)
        untracked(() => {
          this.pendingSelection.set(null);
          this.queue.add(id, pending.files, pending.role);
        });
      const version = this.queue.completedVersion();
      if (version !== this.completedVersion)
        untracked(() => {
          this.completedVersion = version;
          this.load();
        });
    });
  }
  ngOnInit(): void {
    if (this.projectId()) this.load();
  }
  selectFiles(event: Event, role: MediaRole): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []), role);
    input.value = '';
  }
  dragEnter(event: DragEvent): void {
    event.preventDefault();
    if (!event.dataTransfer?.types.includes('Files') || this.locked() || this.busy()) return;
    this.dragDepth++;
    this.draggingFiles.set(true);
  }
  dragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.draggingFiles.set(false);
  }
  drop(event: DragEvent, role: MediaRole): void {
    event.preventDefault();
    this.dragDepth = 0;
    this.draggingFiles.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []), role);
  }
  addFiles(files: File[], role: MediaRole): void {
    if (!files.length || this.locked() || this.busy()) return;
    if (this.mode() !== 'all') {
      try {
        if (files.some((file) => !validateFile(file).mime_type.startsWith('image/')))
          throw new Error('Selecciona únicamente imágenes JPEG, PNG, WebP o AVIF.');
      } catch (error) {
        this.error.set(
          error instanceof Error ? error.message : 'No se pudo seleccionar la imagen.',
        );
        return;
      }
    }
    const selected = role === 'COVER' ? files.slice(0, 1) : files;
    if (!this.projectId()) {
      if (this.pendingSelection()) return;
      this.pendingSelection.set({ files: selected, role });
      this.draftRequested.emit();
    } else this.queue.add(this.projectId(), selected, role);
  }
  hasVisibleFiles(): boolean {
    return this.links().some((link, index) => this.visibleFile(link, index));
  }
  visibleFile(link: MediaLinkResponse, index: number): boolean {
    return (
      this.visible(link.role) &&
      (this.mode() !== 'gallery' ||
        (this.assets()[link.media_id]?.type === 'IMAGE' &&
          !this.links()
            .slice(0, index)
            .some(
              (previous) => previous.media_id === link.media_id && this.visible(previous.role),
            )))
    );
  }
  visible(role: MediaRole): boolean {
    return this.mode() === 'all'
      ? role === this.group()
      : this.mode() === 'cover'
        ? role === 'COVER'
        : ['GALLERY', 'PLAN', 'RENDER'].includes(role);
  }
  editMetadata(asset: MediaResponse): void {
    if (this.busy() || this.locked()) return;
    this.metadataId.set(asset.id);
    this.metadata.reset({
      title: asset.title ?? '',
      alt_text: asset.alt_text ?? '',
      description: asset.description ?? '',
    });
  }
  saveMetadata(): void {
    const id = this.metadataId();
    this.metadata.markAllAsTouched();
    if (!id || this.metadata.invalid || this.busy() || this.locked()) return;
    const value = this.metadata.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.mediaApi
      .update(id, {
        title: value.title || null,
        alt_text: value.alt_text || null,
        description: value.description || null,
      })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (asset) => {
          this.assets.update((values) => ({ ...values, [id]: asset }));
          this.metadata.markAsPristine();
          this.metadataId.set(null);
          this.message.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
        },
        error: (e) => this.error.set(projectError(e)),
      });
  }
  saveCoverAlt(): void {
    const asset = this.coverAsset();
    this.coverMetadata.markAllAsTouched();
    if (!asset || this.coverMetadata.invalid || this.busy() || this.locked()) return;
    this.busy.set(true);
    this.error.set('');
    this.mediaApi
      .update(asset.id, { alt_text: this.coverMetadata.controls.alt_text.value || null })
      .pipe(
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (updated) => {
          this.assets.update((values) => ({ ...values, [updated.id]: updated }));
          this.coverMetadata.markAsPristine();
          this.message.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
        },
        error: (error: unknown) => {
          this.error.set(projectError(error));
          fieldErrors(this.coverMetadata, error);
        },
      });
  }
  cancelMetadata(): void {
    this.metadataId.set(null);
    this.metadata.markAsPristine();
  }
  hasChanges(): boolean {
    return this.metadata.dirty || this.coverMetadata.dirty;
  }
  prepareSave(): Observable<unknown> {
    const asset = this.coverAsset();
    if (!asset || !this.coverMetadata.dirty) return of(undefined);
    return this.mediaApi
      .update(asset.id, { alt_text: this.coverMetadata.controls.alt_text.value || null })
      .pipe(
        tap((updated) => {
          this.assets.update((values) => ({ ...values, [updated.id]: updated }));
          this.coverMetadata.markAsPristine();
        }),
      );
  }
  cancelPending(): void {
    this.pendingSelection.set(null);
  }
  confirmDetach(answer: boolean): void {
    const link = this.removing();
    this.removing.set(null);
    if (answer && link) this.detach(link);
  }
  private collection(
    includeSectionImages = false,
  ): Observable<{ links: MediaLinkResponse[]; assets: MediaResponse[] }> {
    const links = includeSectionImages
      ? projectPhotographs(this.api, this.sections, this.projectId())
      : allPages((o) => this.api.media(this.projectId(), o));
    return links.pipe(
      switchMap((links) => {
        const ids = [...new Set(links.map((l) => l.media_id))];
        return forkJoin({
          links: of(links),
          assets: ids.length
            ? forkJoin(
                ids.map((id) =>
                  this.assets()[id] ? of(this.assets()[id]) : this.mediaApi.detail(id),
                ),
              )
            : of([]),
        });
      }),
    );
  }
  load(): void {
    if (!this.projectId()) return;
    this.loadedId = this.projectId();
    this.loading.set(true);
    this.collection(true)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({ next: (v) => this.accept(v), error: (e) => this.error.set(projectError(e)) });
  }
  refresh(): void {
    this.assets.set({});
    this.load();
  }
  private accept(v: { links: MediaLinkResponse[]; assets: MediaResponse[] }): void {
    this.links.set(v.links);
    this.assets.set(Object.fromEntries(v.assets.map((a) => [a.id, a])));
    this.ready.set(true);
  }
  private run(request: Observable<unknown>, reloadOnError = false): void {
    if (this.busy() || this.locked() || this.queue.transferring()) return;
    this.busy.set(true);
    this.error.set('');
    request
      .pipe(
        switchMap(() => this.collection()),
        finalize(() => this.busy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (v) => {
          this.accept(v);
          this.message.set(
            'Vista previa actualizada. Guarda los cambios del proyecto para aplicarlos.',
          );
        },
        error: (e) => {
          this.error.set(projectError(e));
          if (reloadOnError) this.load();
        },
      });
  }
  detach(link: MediaLinkResponse): void {
    this.run(this.api.detach(this.projectId(), link.id));
  }
  move(index: number, step: -1 | 1): void {
    const items = [...this.links()];
    const visible = items
      .map((link, index) => ({ link, index }))
      .filter((item) => this.visibleFile(item.link, item.index));
    const position = visible.findIndex((item) => item.index === index);
    const target = visible[position + step]?.index ?? -1;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    this.run(saveOrder(this.api, this.projectId(), 'media', items), true);
  }
  reorderPhotographs(previousIndex: number, currentIndex: number, inside: boolean): void {
    if (
      !inside ||
      previousIndex === currentIndex ||
      this.mode() !== 'gallery' ||
      this.busy() ||
      this.locked() ||
      this.queue.transferring() ||
      this.loading()
    )
      return;
    const items = this.links();
    const visible = items.filter((link, index) => this.visibleFile(link, index));
    if (!visible[previousIndex] || !visible[currentIndex]) return;
    const visibleIds = new Set(visible.map((link) => link.id));
    moveItemInArray(visible, previousIndex, currentIndex);
    let position = 0;
    const ordered = items.map((link) => (visibleIds.has(link.id) ? visible[position++] : link));
    this.links.set(ordered);
    this.run(saveOrder(this.api, this.projectId(), 'media', ordered), true);
  }
  canMove(index: number, step: -1 | 1): boolean {
    const visible = this.links()
      .map((link, index) => ({ link, index }))
      .filter((item) => this.visibleFile(item.link, item.index));
    return !!visible[visible.findIndex((item) => item.index === index) + step];
  }
  label(role: MediaRole): string {
    return this.roles.find((r) => r.value === role)!.label;
  }
}
