import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, switchMap, timer } from 'rxjs';
import type { MediaRole } from '../../../core/api/generated/types.gen';
import { MediaBrowser } from '../media/media-browser.service';
import { MediaUpload } from '../media/media-upload.service';
import { validateFile } from '../media/media-policy';
import { allPages, ProjectApi } from './project-api.service';
import { projectError } from './project-errors';
import { ProjectDraft } from './project-draft';

export interface ProjectUploadJob {
  key: number;
  projectId: string;
  role: MediaRole;
  file: File;
  preview: string | null;
  upload: MediaUpload;
  association: ReturnType<
    typeof signal<'waiting' | 'associating' | 'completed' | 'failed' | 'dismissed'>
  >;
  error: ReturnType<typeof signal<string>>;
  retrying: ReturnType<typeof signal<boolean>>;
  dispose: () => void;
}

/** A serial queue over the existing upload engine; completed assets are never uploaded twice. */
@Injectable()
export class ProjectUploadQueue {
  private readonly injector = inject(Injector);
  private readonly api = inject(ProjectApi);
  private readonly browser = inject(MediaBrowser);
  private readonly destroy = inject(DestroyRef);
  private readonly draft = inject(ProjectDraft, { optional: true });
  private sequence = 0;
  readonly jobs = signal<ProjectUploadJob[]>([]);
  readonly completedVersion = signal(0);
  readonly pending = computed(() =>
    this.jobs().some(
      (j) =>
        !['completed', 'dismissed'].includes(j.association()) && j.upload.stage() !== 'cancelled',
    ),
  );
  readonly transferring = computed(() =>
    this.jobs().some((j) => j.upload.busy || j.association() === 'associating'),
  );

  constructor() {
    effect(() => {
      const jobs = this.jobs();
      for (const job of jobs) {
        const stage = job.upload.stage();
        const association = job.association();
        if (job.retrying() && stage === 'cancelled') {
          untracked(() => {
            job.retrying.set(false);
            job.upload.retry();
          });
          return;
        }
        if (stage === 'completed' && association === 'waiting') {
          untracked(() => this.associate(job));
          return;
        }
      }
      if (jobs.some((j) => j.upload.busy || j.association() === 'associating')) return;
      const next = jobs.find(
        (j) => j.upload.stage() === 'selected' && j.association() === 'waiting',
      );
      if (next) untracked(() => next.upload.start());
    });
    this.destroy.onDestroy(() => {
      for (const job of this.jobs()) {
        job.dispose();
        this.browser.revoke(job.preview);
      }
    });
  }
  add(projectId: string, files: readonly File[], role: MediaRole): void {
    if (!projectId) return;
    const added: ProjectUploadJob[] = [];
    for (const file of files) {
      const child = Injector.create({ parent: this.injector, providers: [MediaUpload] });
      const upload = child.get(MediaUpload);
      // Public use is conditional on backend references, not a public R2 bucket.
      upload.access.set('public');
      upload.select(file);
      const mime = upload.stage() === 'selected' ? validateFile(file).mime_type : '';
      const assignedRole: MediaRole =
        role === 'GALLERY'
          ? mime === 'application/pdf'
            ? 'DOCUMENT'
            : mime === 'model/gltf-binary' || mime === 'model/stl'
              ? 'MODEL'
              : role
          : role;
      if (
        role === 'COVER' &&
        upload.stage() === 'selected' &&
        validateFile(file).mime_type.startsWith('image/') === false
      ) {
        upload.stage.set('failed');
        upload.error.set('La portada requiere una imagen JPEG, PNG, WebP o AVIF.');
      }
      added.push({
        key: ++this.sequence,
        projectId,
        role: assignedRole,
        file,
        preview: file.type.startsWith('image/') ? this.browser.create(file) : null,
        upload,
        association: signal('waiting'),
        error: signal(''),
        retrying: signal(false),
        dispose: () => child.destroy(),
      });
    }
    this.jobs.update((j) => [...j, ...added]);
  }
  private associate(job: ProjectUploadJob): void {
    const asset = job.upload.asset();
    if (!asset || job.association() === 'associating') return;
    job.association.set('associating');
    job.error.set('');
    // Reconcile first: an earlier response may have been lost after the backend committed.
    allPages((offset) => this.api.media(job.projectId, offset))
      .pipe(
        switchMap((links) => {
          const existing = links.find((l) => l.media_id === asset.id && l.role === job.role);
          if (existing) return of(existing);
          return job.role === 'COVER'
            ? this.api.cover(job.projectId, asset.id)
            : this.api.attach(job.projectId, {
                media_id: asset.id,
                role: job.role,
                sort_order: Math.max(-1, ...links.map((l) => l.sort_order ?? 0)) + 1,
              });
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          job.association.set('completed');
          this.completedVersion.update((v) => v + 1);
          if (job.file.type.startsWith('image/') || job.upload.asset()?.type === 'IMAGE') {
            timer(5000)
              .pipe(takeUntilDestroyed(this.destroy))
              .subscribe(() => {
                if (this.jobs().includes(job) && job.association() === 'completed')
                  this.remove(job);
              });
          }
        },
        error: (e) => {
          job.association.set('failed');
          job.error.set(projectError(e));
        },
      });
  }
  retry(job: ProjectUploadJob): void {
    try {
      if (job.role === 'COVER' && !validateFile(job.file).mime_type.startsWith('image/')) return;
    } catch {
      return;
    }
    if (job.upload.busy || job.association() === 'associating' || job.association() === 'completed')
      return;
    if (job.upload.asset()) {
      job.association.set('waiting');
      return;
    }
    if (job.upload.canConfirm) {
      job.upload.confirm();
      return;
    }
    // Revoke an unresolved authorization before obtaining a new signed capability.
    if (job.upload.unresolved) {
      job.retrying.set(true);
      job.upload.cancel();
    } else job.upload.retry();
  }
  previewFailed(job: ProjectUploadJob): void {
    this.browser.revoke(job.preview);
    job.preview = null;
    this.jobs.update((jobs) => [...jobs]);
  }
  cancel(job: ProjectUploadJob): void {
    if (job.association() === 'associating' || job.upload.stage() === 'confirming') return;
    job.retrying.set(false);
    job.upload.cancel();
    if (job.upload.asset()) job.association.set('dismissed');
  }
  remove(job: ProjectUploadJob): void {
    if (job.upload.busy || job.association() === 'associating' || job.upload.unresolved) return;
    job.dispose();
    this.browser.revoke(job.preview);
    this.jobs.update((j) => j.filter((v) => v !== job));
  }
  label(job: ProjectUploadJob): string {
    if (job.association() === 'completed')
      return this.draft?.pending()
        ? job.role === 'COVER'
          ? 'Imagen subida. Guarda los cambios para aplicar la portada.'
          : 'Vista previa lista; cambios sin guardar'
        : 'Guardado en el proyecto';
    if (job.association() === 'associating') return 'Asociando al proyecto…';
    if (job.association() === 'failed') return 'Archivo subido; asociación pendiente';
    if (job.association() === 'dismissed') return 'Conservado en la biblioteca, sin asociar';
    return {
      selected: 'En espera',
      converting: `Convirtiendo STL a GLB… ${job.upload.conversionProgress() ?? 0}%`,
      authorizing: 'Solicitando autorización…',
      uploading:
        job.upload.progress() === null
          ? 'Conectando con R2…'
          : `Transfiriendo ${job.upload.progress()}%`,
      confirming: 'Confirmando archivo…',
      completed: 'Preparando asociación…',
      failed: 'No completado',
      cancelling: 'Cancelando…',
      cancelled: 'Cancelado',
    }[job.upload.stage()];
  }
}
