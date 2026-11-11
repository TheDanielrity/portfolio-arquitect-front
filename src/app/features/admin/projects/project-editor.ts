import { DatePipe, Location } from '@angular/common';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, of, skip, Subscription, switchMap, timer } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import type {
  ProjectCreate,
  ProjectResponse,
  ProjectStatus,
  Visibility,
} from '../../../core/api/generated/types.gen';
import { projectSlug } from './project-slug';
import { ProjectApi } from './project-api.service';
import {
  fieldErrors,
  projectError,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
} from './project-errors';
import { ProjectTaxonomy } from './project-taxonomy';
import { ProjectAttributes } from './project-attributes';
import { ProjectMedia } from './project-media';
import { ProjectConfirm } from './project-confirm';
import { ProjectSections } from './sections/project-sections';
import { ContentApi } from '../content/content-api.service';
import { generateProjectSeo } from './project-seo';
import { MediaBrowser } from '../media/media-browser.service';
import { MediaApi } from '../media/media-api.service';
import { ProjectSectionsApi } from './sections/project-sections-api.service';
import { ProjectDraft } from './project-draft';
import { ProjectDraftApi } from './project-draft-api';
import { SectionDraftApi } from './sections/section-draft-api';
import { ProjectMediaDraftApi } from './project-media-draft-api';
const integer = (control: AbstractControl) =>
  control.value === null || Number.isInteger(control.value) ? null : { integer: true };
const area = (control: AbstractControl) =>
  !control.value ||
  (/^(?:\d{1,10})(?:\.\d{1,2})?$/.test(control.value) && Number(control.value) > 0)
    ? null
    : { area: true };
const text = (max: number, required = false) =>
  new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.maxLength(max),
      ...(required ? [Validators.required, Validators.pattern(/\S/)] : []),
    ],
  });
@Component({
  selector: 'app-project-editor',
  providers: [
    ProjectDraft,
    { provide: ProjectApi, useClass: ProjectDraftApi },
    { provide: ProjectSectionsApi, useClass: SectionDraftApi },
    { provide: MediaApi, useClass: ProjectMediaDraftApi },
  ],
  imports: [
    CdkScrollable,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    ProjectTaxonomy,
    ProjectAttributes,
    ProjectMedia,
    ProjectConfirm,
    ProjectSections,
  ],
  templateUrl: './project-editor.html',
  styleUrls: ['./project-controls.scss', './project-editor.scss'],
})
export class ProjectEditor {
  readonly draft = inject(ProjectDraft);
  private readonly api = inject(ProjectApi);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  id = this.route.snapshot.paramMap.get('id');
  private loadingRequest?: Subscription;
  readonly project = signal<ProjectResponse | null>(null);
  readonly state = signal<'loading' | 'ready' | 'error'>(this.id ? 'loading' : 'ready');
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  private successTimer?: Subscription;
  private savedNotice(): void {
    this.successTimer?.unsubscribe();
    this.success.set('Proyecto guardado.');
    this.successTimer = timer(3000)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.success.set(''));
  }
  readonly retryAfter = signal<string | null>(null);
  readonly confirmation = signal<'delete' | 'leave' | 'publish' | 'link' | null>(null);
  readonly submitted = signal(false);
  readonly customLink = signal(false);
  private manualSlug = false;
  readonly customSeo = signal(!!this.id);
  readonly studioName = signal('');
  readonly seoSettingsState = signal<'loading' | 'ready' | 'error'>('loading');
  private acceptingProject = false;
  readonly attributes = viewChild(ProjectAttributes);
  readonly taxonomy = viewChild(ProjectTaxonomy);
  private leaveAnswer?: (value: boolean) => void;
  readonly sections = viewChild(ProjectSections);
  readonly media = viewChild(ProjectMedia);
  readonly tab = signal(
    this.router.currentNavigation()?.extras.state?.['createdProject'] ? 'media' : 'basic',
  );
  readonly tabs = [
    { id: 'basic', label: 'Información del proyecto' },
    { id: 'details', label: 'Datos del proyecto' },
    { id: 'cover', label: 'Portada' },
    { id: 'media', label: 'Fotografías' },
    { id: 'sections', label: 'Presentación del proyecto' },
    { id: 'seo', label: 'Apariencia en Google' },
    { id: 'publication', label: 'Publicación' },
  ];
  private deleted = false;
  readonly statuses = PROJECT_STATUSES;
  readonly visibilities = PROJECT_VISIBILITIES;
  readonly form = new FormGroup({
    title: text(200, true),
    slug: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(220),
        Validators.pattern(/^[a-z0-9]+(-[a-z0-9]+)*$/),
      ],
    }),
    short_description: text(500),
    description: text(50000),
    location: text(255),
    year: new FormControl<number | null>(null, [
      Validators.min(1800),
      Validators.max(2200),
      integer,
    ]),
    area_m2: new FormControl('', { nonNullable: true, validators: [area] }),
    client_name: text(200),
    status: new FormControl<ProjectStatus>('DRAFT', { nonNullable: true }),
    visibility: new FormControl<Visibility>('PUBLIC', { nonNullable: true }),
    seo_title: text(200),
    seo_description: text(320),
  });
  constructor() {
    inject(ContentApi)
      .setting('site_title')
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (setting) => {
          this.studioName.set(typeof setting.value === 'string' ? setting.value : '');
          this.seoSettingsState.set('ready');
          this.updateAutomaticSeo();
        },
        error: (error: unknown) => {
          this.seoSettingsState.set(
            error instanceof ApiError && error.status === 404 ? 'ready' : 'error',
          );
        },
      });
    for (const control of [
      this.form.controls.title,
      this.form.controls.short_description,
      this.form.controls.description,
    ]) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroy))
        .subscribe(() => this.updateAutomaticSeo());
    }
    this.form.controls.title.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe((title) => {
        if (!this.id && !this.manualSlug && !this.form.controls.slug.dirty)
          this.form.controls.slug.setValue(projectSlug(title));
        if (this.form.dirty) this.success.set('');
      });
    this.destroy.onDestroy(
      inject(MediaBrowser).warnBeforeUnload(
        () =>
          this.form.dirty ||
          this.draft.pending() ||
          !!this.attributes()?.hasChanges() ||
          !!this.taxonomy()?.hasChanges() ||
          !!this.media()?.pending() ||
          !!this.media()?.hasChanges() ||
          !!this.sections()?.hasChanges(),
      ),
    );
    if (this.id) this.load();
    this.route.paramMap.pipe(skip(1), takeUntilDestroyed(this.destroy)).subscribe((params) => {
      const id = params.get('id');
      if (id === this.id) return;
      this.loadingRequest?.unsubscribe();
      this.id = id;
      this.draft.reset();
      this.project.set(null);
      this.success.set('');
      if (id) this.load();
    });
    this.destroy.onDestroy(() => this.leaveAnswer?.(false));
  }
  setCustomSeo(custom: boolean): void {
    this.customSeo.set(custom);
    this.updateAutomaticSeo();
    this.form.markAsDirty();
    this.success.set('');
  }
  private updateAutomaticSeo(): void {
    if (this.customSeo() || this.acceptingProject) return;
    this.form.patchValue(generateProjectSeo(this.form.getRawValue(), this.studioName()), {
      emitEvent: false,
    });
  }
  load(): void {
    if (!this.id) return;
    this.state.set('loading');
    this.error.set('');
    this.loadingRequest?.unsubscribe();
    this.loadingRequest = this.api
      .detail(this.id)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          this.accept(p);
          this.state.set('ready');
        },
        error: (e) => {
          this.state.set('error');
          this.error.set(projectError(e));
        },
      });
  }
  private accept(p: ProjectResponse): void {
    this.submitted.set(false);
    this.project.set(p);
    this.acceptingProject = true;
    this.customSeo.set(true);
    this.form.reset({
      title: p.title,
      slug: p.slug,
      short_description: p.short_description ?? '',
      description: p.description ?? '',
      location: p.location ?? '',
      year: p.year ?? null,
      area_m2: p.area_m2 ?? '',
      client_name: p.client_name ?? '',
      status: p.status ?? 'DRAFT',
      visibility: p.visibility ?? 'PUBLIC',
      seo_title: p.seo_title ?? '',
      seo_description: p.seo_description ?? '',
    });
    this.acceptingProject = false;
  }
  body(): ProjectCreate {
    const v = this.form.getRawValue();
    return {
      ...v,
      title: v.title.trim(),
      slug: v.slug.trim(),
      short_description: v.short_description || null,
      description: v.description || null,
      location: v.location || null,
      area_m2: v.area_m2 || null,
      client_name: v.client_name || null,
      seo_title: v.seo_title || null,
      seo_description: v.seo_description || null,
    };
  }
  invalid(name: string): boolean {
    const c = this.form.get(name);
    return !!c?.invalid && (this.submitted() || (c.touched && c.dirty) || !!c.errors?.['backend']);
  }
  personalizeLink(): void {
    this.customLink.set(true);
    this.tab.set('publication');
  }
  slugEdited(): void {
    this.manualSlug = true;
    this.success.set('');
  }
  save(confirmed = false): void {
    if (
      this.saving() ||
      this.openEditor() ||
      this.attributes()?.busy() ||
      this.taxonomy()?.busy() ||
      this.sections()?.busy() ||
      this.media()?.pending() ||
      this.media()?.busy()
    )
      return;
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.showInvalidTab();
      return;
    }
    if (this.media()?.coverMetadata.invalid) {
      this.media()?.coverMetadata.markAllAsTouched();
      this.tab.set('cover');
      this.error.set('Revisa el texto alternativo de la portada antes de guardar.');
      return;
    }
    if (
      !confirmed &&
      this.project()?.status === 'PUBLISHED' &&
      this.form.controls.slug.value !== this.project()?.slug
    ) {
      this.confirmation.set('link');
      return;
    }
    if (
      !confirmed &&
      this.form.controls.status.value === 'PUBLISHED' &&
      this.project()?.status !== 'PUBLISHED'
    ) {
      this.confirmation.set('publish');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    this.retryAfter.set(null);
    this.form.disable();
    const body = this.body();
    const request = this.id
      ? (this.media()?.prepareSave() ?? of(undefined)).pipe(
          switchMap(() => this.draft.commit()),
          switchMap(() => this.api.update(this.id!, body)),
        )
      : this.api.create(body);
    request
      .pipe(
        finalize(() => {
          this.saving.set(false);
          if (this.form.disabled) this.form.enable();
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (p) => {
          const customSeo = this.customSeo();
          this.accept(p);
          this.customSeo.set(customSeo);
          this.savedNotice();
          if (this.id) {
            this.draft.refresh();
            this.attributes()?.load();
            this.taxonomy()?.load();
            this.sections()?.load();
            this.media()?.refresh();
          }
          if (!this.id) {
            this.tab.set('media');
            void this.router.navigate(['/admin/projects', p.id, 'edit'], {
              state: { createdProject: true },
            });
          }
        },
        error: (e: unknown) => {
          this.form.enable();
          const failedPart = this.draft.failure();
          if (!failedPart) this.form.markAsDirty();
          this.error.set(
            failedPart
              ? failedPart +
                  ': ' +
                  projectError(e) +
                  ' Los cambios pendientes se conservan. Puedes corregirlos o reintentar el guardado.'
              : e instanceof ApiError && e.status === 409
                ? 'No se pudo guardar. El enlace puede estar en uso por otro proyecto. Personalízalo e intenta de nuevo.'
                : projectError(e),
          );
          if (!failedPart && e instanceof ApiError && e.status === 409) {
            this.tab.set('publication');
            this.customLink.set(true);
          }
          this.retryAfter.set(e instanceof ApiError ? e.retryAfter : null);
          if (!failedPart) fieldErrors(this.form, e);
          if (this.form.invalid) this.showInvalidTab();
        },
      });
  }
  ensureDraft(): void {
    if (this.id || this.saving()) return;
    const title = this.form.controls.title;
    const slug = this.form.controls.slug;
    title.markAsTouched();
    slug.markAsTouched();
    if (title.invalid || slug.invalid) {
      this.tab.set('basic');
      this.error.set('Escribe el nombre del proyecto y revisa su enlace antes de añadir archivos.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api
      .create({
        title: title.value.trim(),
        slug: slug.value.trim(),
        status: 'DRAFT',
        visibility: this.form.controls.visibility.value,
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (project) => {
          this.id = project.id;
          this.project.set(project);
          this.form.controls.status.setValue('DRAFT');
          this.form.markAsDirty();
          this.location.replaceState('/admin/projects/' + project.id + '/edit');
          this.success.set(
            'Borrador inicial guardado. Las imágenes se guardan inmediatamente; guarda los demás campos cuando termines.',
          );
        },
        error: (error) => {
          this.error.set(projectError(error));
          this.retryAfter.set(error instanceof ApiError ? error.retryAfter : null);
          fieldErrors(this.form, error);
          this.tab.set('basic');
        },
      });
  }
  private showInvalidTab(): void {
    const c = this.form.controls;
    if (c.title.invalid || c.short_description.invalid || c.description.invalid) {
      this.tab.set('basic');
    } else if (c.slug.invalid) {
      this.tab.set('publication');
      if (c.slug.invalid) this.customLink.set(true);
    } else if (c.seo_title.invalid || c.seo_description.invalid) {
      this.tab.set('seo');
    } else if (c.location.invalid || c.year.invalid || c.area_m2.invalid || c.client_name.invalid) {
      this.tab.set('details');
    } else this.tab.set('basic');
  }
  answer(accepted: boolean): void {
    const kind = this.confirmation();
    this.confirmation.set(null);
    if (kind === 'publish' || kind === 'link') {
      if (accepted) this.save(true);
      return;
    }
    if (kind === 'leave') {
      this.leaveAnswer?.(accepted);
      this.leaveAnswer = undefined;
      return;
    }
    if (
      kind === 'delete' &&
      accepted &&
      this.id &&
      !this.saving() &&
      !this.sections()?.busy() &&
      !this.attributes()?.busy() &&
      !this.taxonomy()?.busy() &&
      !this.media()?.pending() &&
      !this.media()?.busy()
    ) {
      this.saving.set(true);
      this.api
        .delete(this.id)
        .pipe(
          finalize(() => this.saving.set(false)),
          takeUntilDestroyed(this.destroy),
        )
        .subscribe({
          next: () => {
            this.deleted = true;
            this.form.markAsPristine();
            void this.router.navigate(['/admin/projects']);
          },
          error: (e) => this.error.set(projectError(e)),
        });
    }
  }
  canLeave(): boolean | Promise<boolean> {
    if (this.auth.status() !== 'authenticated' || this.deleted) return true;
    if (
      this.saving() ||
      this.sections()?.busy() ||
      this.media()?.busy() ||
      this.attributes()?.busy() ||
      this.taxonomy()?.busy()
    )
      return false;
    if (
      !this.form.dirty &&
      !this.draft.pending() &&
      !this.attributes()?.hasChanges() &&
      !this.taxonomy()?.hasChanges() &&
      !this.sections()?.hasChanges() &&
      !this.media()?.pending() &&
      !this.media()?.hasChanges()
    )
      return true;
    if (this.leaveAnswer) return false;
    this.confirmation.set('leave');
    return new Promise((resolve) => {
      this.leaveAnswer = resolve;
    });
  }

  openEditor(): boolean {
    return (
      !!this.attributes()?.expanded() ||
      !!this.sections()?.editing() ||
      !!this.taxonomy()?.expanded() ||
      !!this.media()?.metadataId()
    );
  }
}
