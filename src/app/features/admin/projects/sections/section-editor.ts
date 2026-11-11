import {
  afterRenderEffect,
  Component,
  DestroyRef,
  effect,
  untracked,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  concatMap,
  finalize,
  forkJoin,
  from,
  Observable,
  of,
  Subscription,
  switchMap,
  timer,
  toArray,
} from 'rxjs';
import type {
  MediaResponse,
  SectionCreate,
  SectionResponse,
  SectionType,
} from '../../../../core/api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-error';
import { MediaApi } from '../../media/media-api.service';
import { MediaUpload } from '../../media/media-upload.service';
import { isStl, MEDIA_FORMATS, validateFile } from '../../media/media-policy';
import { MediaPreview } from '../../media/media-preview';
import { ProjectMediaPicker } from '../project-media-picker';
import { allPages, ProjectApi } from '../project-api.service';
import { ProjectSectionsApi } from './project-sections-api.service';
import { compatible, SECTION_POLICY, EDITABLE_SECTION_TYPES, sectionError } from './section-policy';

@Component({
  selector: 'app-section-editor',
  providers: [MediaUpload],
  imports: [ReactiveFormsModule, ProjectMediaPicker, MediaPreview],
  templateUrl: './section-editor.html',
  styleUrls: ['../project-controls.scss', './sections.scss'],
})
export class SectionEditor implements OnInit {
  readonly upload = inject(MediaUpload);
  readonly uploadResultHidden = signal(false);
  readonly draggingFiles = signal(false);
  private dragDepth = 0;
  private uploadResultTimer?: Subscription;
  private selectedUploadId: string | null = null;
  private readonly uploadedIds = new Set<string>();
  private readonly projects = inject(ProjectApi);
  readonly projectId = input.required<string>();
  readonly section = input<SectionResponse | null>(null);
  readonly type = input<SectionType>('TEXT');
  readonly order = input(0);
  readonly locked = input(false);
  readonly saved = output<void>();
  readonly cancelled = output<void>();
  private readonly api = inject(ProjectSectionsApi);
  private readonly mediaApi = inject(MediaApi);
  private readonly destroy = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private focused = false;
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly picker = signal(false);
  readonly assets = signal<Record<string, MediaResponse>>({});
  readonly policies = SECTION_POLICY;
  readonly types = EDITABLE_SECTION_TYPES;
  readonly form = new FormGroup({
    section_type: new FormControl<SectionType>('TEXT', { nonNullable: true }),
    title: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    content: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50000) }),
    is_visible: new FormControl(true, { nonNullable: true }),
    sort_order: new FormControl(0, { nonNullable: true }),
    media: new FormArray<
      FormGroup<{
        media_id: FormControl<string>;
        sort_order: FormControl<number>;
        caption: FormControl<string>;
      }>
    >([]),
  });
  private initial = '';
  constructor() {
    effect(() => {
      const asset = this.upload.asset();
      if (this.upload.stage() === 'completed' && asset && asset.id !== this.selectedUploadId) {
        this.selectedUploadId = asset.id;
        this.uploadedIds.add(asset.id);
        untracked(() => this.select(asset));
        untracked(() => {
          this.uploadResultTimer?.unsubscribe();
          this.uploadResultHidden.set(false);
          if (asset.type === 'IMAGE') {
            this.uploadResultTimer = timer(5000)
              .pipe(takeUntilDestroyed(this.destroy))
              .subscribe(() => this.uploadResultHidden.set(true));
          }
        });
      }
    });
    // Angular render hooks do not run during SSR; focus only after the editor is ready.
    afterRenderEffect(() => {
      if (!this.loaded() || this.focused) return;
      this.host.nativeElement.querySelector<HTMLSelectElement>('select')?.focus();
      this.focused = true;
    });
  }
  ngOnInit(): void {
    this.load();
  }
  hasChanges(): boolean {
    return this.form.dirty || this.upload.busy || this.upload.unresolved;
  }
  uploadPending(): boolean {
    return this.upload.busy || this.upload.unresolved;
  }
  uploadAccept(): string {
    const formats = MEDIA_FORMATS.filter(
      (format) => format.type === this.policies[this.form.controls.section_type.value].media,
    )
      .flatMap((format) => format.extensions.map((extension) => '.' + extension))
      .join(',');
    return this.form.controls.section_type.value === 'MODEL_3D' ? formats + ',.stl' : formats;
  }
  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.startFileUpload(file);
  }
  canUploadGallery(): boolean {
    return (
      this.form.controls.section_type.value === 'GALLERY' &&
      this.loaded() &&
      !this.loading() &&
      !this.busy() &&
      !this.locked() &&
      !this.uploadPending() &&
      this.form.controls.media.length < this.policies.GALLERY.maximum
    );
  }
  galleryDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!event.dataTransfer?.types.includes('Files') || !this.canUploadGallery()) return;
    this.dragDepth++;
    this.draggingFiles.set(true);
  }
  galleryDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.draggingFiles.set(false);
  }
  galleryDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = this.canUploadGallery() ? 'copy' : 'none';
  }
  dropGalleryFile(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragDepth = 0;
    this.draggingFiles.set(false);
    if (!this.canUploadGallery()) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    if (files.length > 1) {
      this.error.set('Sube una imagen a la vez desde esta sección.');
      return;
    }
    this.startFileUpload(files[0]);
  }
  private startFileUpload(file: File): void {
    if (!file || this.busy() || this.locked() || this.uploadPending()) return;
    try {
      const policy = this.policies[this.form.controls.section_type.value];
      const mime = validateFile(file).mime_type;
      if (
        !(policy.media === 'MODEL_3D' && isStl(file)) &&
        !MEDIA_FORMATS.some((format) => format.mime === mime && format.type === policy.media)
      )
        throw new Error('Elige un archivo compatible con esta sección.');
      if (this.form.controls.media.length >= policy.maximum)
        throw new Error('Quita el archivo actual antes de elegir su reemplazo.');
      this.upload.access.set('public');
      this.upload.select(file);
      this.upload.start();
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo seleccionar el archivo.');
    }
  }
  reselectFile(): void {
    this.host.nativeElement.querySelector<HTMLInputElement>('#section-upload-file')?.click();
  }
  private relation(id: string, order: number, caption: string | null = null) {
    return new FormGroup({
      media_id: new FormControl(id, { nonNullable: true }),
      sort_order: new FormControl(order, { nonNullable: true }),
      caption: new FormControl(caption ?? '', {
        nonNullable: true,
        validators: Validators.maxLength(255),
      }),
    });
  }
  load(): void {
    const section = this.section();
    if (!section) {
      this.form.patchValue({ section_type: this.type(), sort_order: this.order() });
      this.initial = JSON.stringify(this.body());
      this.loaded.set(true);
      return;
    }
    this.loaded.set(false);
    this.loading.set(true);
    forkJoin({
      section: this.api.detail(this.projectId(), section.id),
      media: allPages((offset) => this.api.media(this.projectId(), section.id, offset)),
    })
      .pipe(
        switchMap((result) =>
          forkJoin({
            result: of(result),
            assets: result.media.length
              ? forkJoin(result.media.map((m) => this.mediaApi.detail(m.media_id)))
              : of([] as MediaResponse[]),
          }),
        ),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: ({ result, assets }) => {
          this.form.controls.media.clear();
          for (const m of result.media)
            this.form.controls.media.push(this.relation(m.media_id, m.sort_order ?? 0, m.caption));
          this.form.patchValue({
            ...result.section,
            title: result.section.title ?? '',
            content: result.section.content ?? '',
          });
          this.assets.set(Object.fromEntries(assets.map((a) => [a.id, a])));
          this.form.markAsPristine();
          this.loaded.set(true);
          this.initial = JSON.stringify(this.body());
        },
        error: (e) => this.error.set(sectionError(e)),
      });
  }
  body(): SectionCreate {
    const v = this.form.getRawValue();
    return {
      ...v,
      title: v.title || null,
      content: v.content || null,
      media: v.media.map((m, i) => ({ ...m, sort_order: i, caption: m.caption || null })),
    };
  }
  select(asset: MediaResponse): void {
    const type = this.form.controls.section_type.value;
    if (!compatible(type, asset)) {
      this.error.set('Selecciona un archivo compatible. Los modelos deben ser GLB.');
      return;
    }
    if (this.form.controls.media.controls.some((m) => m.controls.media_id.value === asset.id)) {
      this.error.set('El archivo ya está seleccionado.');
      return;
    }
    if (this.form.controls.media.length >= this.policies[type].maximum) {
      this.error.set('Quita el archivo actual antes de elegir su reemplazo.');
      return;
    }
    this.assets.update((all) => ({ ...all, [asset.id]: asset }));
    this.form.controls.media.push(this.relation(asset.id, this.form.controls.media.length));
    this.form.markAsDirty();
    this.picker.set(false);
    this.error.set('');
  }
  remove(index: number): void {
    this.form.controls.media.removeAt(index);
    this.form.markAsDirty();
  }
  move(index: number, direction: number): void {
    const media = this.form.controls.media;
    const next = index + direction;
    if (next < 0 || next >= media.length || this.busy()) return;
    const control = media.at(index);
    media.removeAt(index);
    media.insert(next, control);
    this.form.markAsDirty();
  }
  save(): void {
    if (this.busy() || this.uploadPending() || this.loading() || this.locked() || !this.loaded())
      return;
    this.form.markAllAsTouched();
    const body = this.body();
    const policy = this.policies[body.section_type];
    const media = body.media ?? [];
    if (this.form.invalid) {
      this.error.set(
        'Revisa los campos: título hasta 200 caracteres, contenido hasta 50000 y textos de imagen hasta 255.',
      );
      return;
    }
    if (
      (!body.title?.trim() && !body.content?.trim() && !media.length) ||
      media.length > policy.maximum ||
      media.some(
        (m) =>
          !this.assets()[m.media_id] || !compatible(body.section_type, this.assets()[m.media_id]),
      ) ||
      (body.is_visible &&
        ((policy.text && !body.content?.trim()) || (policy.media && !media.length)))
    ) {
      this.error.set(
        'Completa el contenido requerido y selecciona archivos compatibles antes de guardar.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.form.disable();
    const section = this.section();
    const previous = JSON.parse(this.initial) as SectionCreate;
    const normalized = (value: SectionCreate) =>
      JSON.stringify({
        ...value,
        media: [...(value.media ?? [])]
          .map((m) => ({ ...m, sort_order: 0 }))
          .sort((a, b) => a.media_id.localeCompare(b.media_id)),
      });
    const orderOnly =
      !!section &&
      normalized(previous) === normalized(body) &&
      this.initial !== JSON.stringify(body);
    const request: Observable<unknown> = section
      ? orderOnly
        ? this.api.orderMedia(this.projectId(), section.id, {
            items: media.map((m, i) => ({ id: m.media_id, sort_order: i })),
          })
        : this.api.update(this.projectId(), section.id, body)
      : this.api.create(this.projectId(), body);
    const uploaded =
      body.section_type === 'GALLERY'
        ? media.filter((item) => this.uploadedIds.has(item.media_id))
        : [];
    const photographs: Observable<unknown> = uploaded.length
      ? allPages((offset) => this.projects.media(this.projectId(), offset)).pipe(
          switchMap((links) =>
            from(
              uploaded.filter(
                (item) =>
                  !links.some((link) => link.role === 'GALLERY' && link.media_id === item.media_id),
              ),
            ).pipe(
              concatMap((item, index) =>
                this.projects.attach(this.projectId(), {
                  media_id: item.media_id,
                  role: 'GALLERY',
                  sort_order:
                    Math.max(-1, ...links.map((link) => link.sort_order ?? 0)) + 1 + index,
                }),
              ),
              toArray(),
            ),
          ),
        )
      : of(undefined);
    photographs
      .pipe(switchMap(() => request))
      .pipe(
        finalize(() => {
          this.busy.set(false);
          if (this.form.disabled) this.form.enable();
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.form.markAsPristine();
          this.saved.emit();
        },
        error: (e: unknown) => {
          this.form.enable();
          this.error.set(sectionError(e));
          if (e instanceof ApiError && e.status === 422)
            for (const issue of e.validationIssues) {
              const path = issue.loc.filter((part) => part !== 'body');
              this.form.get(path.map(String))?.setErrors({ backend: true });
            }
          if (orderOnly) this.load();
        },
      });
  }
}
