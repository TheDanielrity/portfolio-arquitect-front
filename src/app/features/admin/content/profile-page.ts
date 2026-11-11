import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MediaUploadPanel } from '../media/media-upload-panel';
import { catchError, finalize, forkJoin, of, Subscription, timer } from 'rxjs';
import type {
  ProfileCreate,
  ProfileResponse,
  MediaResponse,
} from '../../../core/api/generated/types.gen';
import { ApiError } from '../../../core/api/api-error';
import { MediaApi } from '../media/media-api.service';
import { MediaPreview } from '../media/media-preview';
import { ProjectMediaPicker } from '../projects/project-media-picker';
import { fieldErrors } from '../projects/project-errors';
import { ContentApi } from './content-api.service';
import { ContentDraft, ContentLeaveConfirm } from './content-draft';
import { contentText, contentError } from './content-forms';
import { SocialLinks } from './social-links';
type Reference = 'profile_media_id' | 'cv_media_id';
@Component({
  selector: 'app-profile-page',
  imports: [
    ReactiveFormsModule,
    MediaUploadPanel,
    MediaPreview,
    ProjectMediaPicker,
    SocialLinks,
    ContentLeaveConfirm,
  ],
  providers: [ContentDraft],
  templateUrl: './profile-page.html',
  styleUrls: [
    '../projects/project-controls.scss',
    './content-controls.scss',
    './profile-page.scss',
  ],
})
export class ProfilePage implements OnInit {
  private readonly api = inject(ContentApi);
  private readonly mediaApi = inject(MediaApi);
  private readonly destroy = inject(DestroyRef);
  readonly draft = inject(ContentDraft);
  readonly social = viewChild(SocialLinks);
  readonly uploadPanel = viewChild(MediaUploadPanel);
  readonly uploadTarget = signal<Reference | null>(null);
  readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('photoInput');
  readonly photoFile = signal<File | null>(null);
  readonly logoDragActive = signal(false);
  private logoDragDepth = 0;
  logoDragEnter(event: DragEvent): void {
    event.preventDefault();
    if (
      !event.dataTransfer?.types.includes('Files') ||
      this.saving() ||
      this.mediaBusy() ||
      this.uploadPending()
    )
      return;
    this.logoDragDepth++;
    this.logoDragActive.set(true);
  }
  logoDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.logoDragDepth = Math.max(0, this.logoDragDepth - 1);
    if (this.logoDragDepth === 0) this.logoDragActive.set(false);
  }
  photoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.selectLogo(file);
  }
  logoDropped(event: DragEvent): void {
    event.preventDefault();
    this.logoDragDepth = 0;
    this.logoDragActive.set(false);
    if (this.saving() || this.mediaBusy() || this.uploadPending()) return;
    if (event.dataTransfer?.files.length !== 1) {
      this.mediaError.set('Selecciona un solo archivo para el logo.');
      return;
    }
    this.selectLogo(event.dataTransfer.files[0]);
  }
  private selectLogo(file: File | undefined): void {
    if (!file || this.saving() || this.mediaBusy() || this.uploadPending()) return;
    this.mediaError.set('');
    this.uploadTarget.set('profile_media_id');
    this.photoFile.set(file);
  }
  uploaded(asset: MediaResponse): void {
    const target = this.uploadTarget();
    if (!target) return;
    this.assign(target, asset);
    this.photoFile.set(null);
  }
  openUpload(key: Reference): void {
    if (this.saving() || this.mediaBusy() || this.uploadPending()) return;
    this.photoFile.set(null);
    this.uploadTarget.set(key);
    if (key === 'profile_media_id') this.photoInput()?.nativeElement.click();
  }
  readonly profile = signal<ProfileResponse | null>(null);
  readonly state = signal<'loading' | 'empty' | 'ready' | 'error'>('loading');
  readonly saving = signal(false);
  readonly mediaBusy = signal(false);
  readonly error = signal('');
  readonly mediaError = signal('');
  readonly notice = signal('');
  private noticeTimer?: Subscription;
  private savedNotice(): void {
    this.noticeTimer?.unsubscribe();
    this.notice.set('Perfil guardado.');
    this.noticeTimer = timer(3000)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.notice.set(''));
  }
  readonly picker = signal<Reference | null>(null);
  readonly cvTypes = ['PDF', 'DOCUMENT'] as const;
  readonly assets = signal<Record<Reference, MediaResponse | null>>({
    profile_media_id: null,
    cv_media_id: null,
  });
  readonly form = new FormGroup({
    first_name: contentText(100, true),
    last_name: contentText(100, true),
    professional_title: contentText(150),
    short_bio: contentText(2000),
    biography: contentText(50000),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(320), Validators.pattern(/^[^\s@]+@[^\s@]+$/)],
    }),
    phone: contentText(50),
    location: contentText(200),
    profile_media_id: new FormControl<string | null>(null),
    cv_media_id: new FormControl<string | null>(null),
  });
  readonly fields = [
    { name: 'first_name', label: 'Nombre', max: 100, required: true, large: false },
    { name: 'last_name', label: 'Apellido', max: 100, required: true, large: false },
    {
      name: 'professional_title',
      label: 'Título profesional',
      max: 150,
      required: false,
      large: false,
    },
    { name: 'short_bio', label: 'Biografía breve', max: 2000, required: false, large: true },
    { name: 'biography', label: 'Biografía', max: 50000, required: false, large: true },
    { name: 'email', label: 'Email de contacto', max: 320, required: false, large: false },
    { name: 'phone', label: 'Teléfono', max: 50, required: false, large: false },
    { name: 'location', label: 'Ubicación', max: 200, required: false, large: false },
  ] as const;
  private readonly baseline = signal('');
  private readonly formRevision = signal(0);
  readonly hasChanges = computed(() => {
    this.formRevision();
    return JSON.stringify(this.body()) !== this.baseline();
  });
  readonly references = [
    { name: 'profile_media_id', label: 'Logo' },
    { name: 'cv_media_id', label: 'CV' },
  ] as const;
  ngOnInit(): void {
    this.baseline.set(JSON.stringify(this.body()));
    this.form.events
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.formRevision.update((value) => value + 1));
    this.load();
  }
  load(): void {
    if (this.saving() || this.form.dirty) return;
    this.state.set('loading');
    this.error.set('');
    this.api
      .profile()
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (p) => {
          this.accept(p);
          this.state.set('ready');
        },
        error: (e: unknown) => {
          if (e instanceof ApiError && e.status === 404) {
            this.state.set('empty');
          } else {
            this.state.set('error');
            this.error.set(contentError(e));
          }
        },
      });
  }
  private accept(p: ProfileResponse): void {
    this.profile.set(p);
    this.form.reset({
      first_name: p.first_name,
      last_name: p.last_name,
      professional_title: p.professional_title ?? '',
      short_bio: p.short_bio ?? '',
      biography: p.biography ?? '',
      email: p.email ?? '',
      phone: p.phone ?? '',
      location: p.location ?? '',
      profile_media_id: p.profile_media_id ?? null,
      cv_media_id: p.cv_media_id ?? null,
    });
    this.baseline.set(JSON.stringify(this.body()));
    this.loadMedia();
  }
  loadMedia(): void {
    if (this.mediaBusy()) return;
    this.mediaBusy.set(true);
    this.mediaError.set('');
    const v = this.form.getRawValue();
    const detail = (id: string | null) =>
      id
        ? this.mediaApi.detail(id).pipe(
            catchError((e: unknown) => {
              this.mediaError.set(contentError(e));
              return of(null);
            }),
          )
        : of(null);
    forkJoin({
      profile_media_id: detail(v.profile_media_id),
      cv_media_id: of(null),
    })
      .pipe(
        finalize(() => this.mediaBusy.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (assets) => this.assets.set(assets),
        error: (e) => this.mediaError.set(contentError(e)),
      });
  }
  body(): ProfileCreate {
    const v = this.form.getRawValue();
    return {
      ...v,
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      professional_title: v.professional_title.trim() || null,
      short_bio: v.short_bio.trim() || null,
      biography: v.biography.trim() || null,
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      location: v.location.trim() || null,
    };
  }
  select(asset: MediaResponse): void {
    const key = this.picker();
    if (!key || this.saving() || this.mediaBusy() || this.uploadPending()) return;
    if (this.assign(key, asset)) this.picker.set(null);
  }
  private assign(key: Reference, asset: MediaResponse): boolean {
    if (this.saving() || this.mediaBusy()) return false;
    if (
      (key === 'profile_media_id' && asset.type !== 'IMAGE') ||
      (key === 'cv_media_id' && !this.cvTypes.some((t) => t === asset.type))
    ) {
      this.mediaError.set('Selecciona IMAGE para la foto o PDF/DOCUMENT para el CV.');
      return false;
    }
    this.form.controls[key].setValue(asset.id);
    this.form.markAsDirty();
    this.assets.update((all) => ({ ...all, [key]: asset }));
    this.mediaError.set('');
    this.notice.set('');
    return true;
  }
  uploadPending(): boolean {
    const upload = this.uploadPanel()?.upload;
    return (
      !!upload &&
      (upload.busy ||
        upload.unresolved ||
        (!!upload.file() && !['completed', 'cancelled'].includes(upload.stage())))
    );
  }
  openPicker(key: Reference): void {
    if (!this.saving() && !this.mediaBusy() && !this.uploadPending()) this.picker.set(key);
  }
  remove(key: Reference): void {
    if (this.saving() || this.mediaBusy() || this.uploadPending()) return;
    this.form.controls[key].setValue(null);
    this.form.markAsDirty();
    this.assets.update((all) => ({ ...all, [key]: null }));
  }
  save(): void {
    if (
      this.saving() ||
      this.mediaBusy() ||
      this.uploadPending() ||
      this.social()?.busy() ||
      !['empty', 'ready'].includes(this.state())
    )
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const social = this.social();
    if (social?.whatsappForm.dirty) {
      social.whatsappForm.markAllAsTouched();
      if (social.whatsappForm.invalid) {
        this.error.set('Revisa la configuración de WhatsApp antes de guardar.');
        return;
      }
      const profileChanged = this.hasChanges();
      const pending = social.saveWhatsapp();
      this.saving.set(true);
      this.error.set('');
      this.notice.set('');
      this.form.disable();
      void pending.then((saved) => {
        this.saving.set(false);
        this.form.enable();
        if (!saved) {
          this.error.set(
            'No se pudo guardar WhatsApp. Revisa su configuración y vuelve a intentarlo.',
          );
          return;
        }
        if (profileChanged) this.saveProfile();
        else this.savedNotice();
      });
      return;
    }
    this.saveProfile();
  }
  private saveProfile(): void {
    const body = this.body();
    this.saving.set(true);
    this.error.set('');
    this.notice.set('');
    this.form.disable();
    (this.profile() ? this.api.updateProfile(body) : this.api.createProfile(body))
      .pipe(
        finalize(() => {
          this.saving.set(false);
          if (this.form.disabled) this.form.enable();
        }),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (p) => {
          this.accept(p);
          this.state.set('ready');
          this.savedNotice();
        },
        error: (e: unknown) => {
          this.form.enable();
          this.error.set(contentError(e));
          fieldErrors(this.form, e);
        },
      });
  }
  canLeave(): boolean | Promise<boolean> {
    return this.draft.canLeave(
      this.form.dirty || !!this.social()?.hasChanges() || this.uploadPending(),
      this.saving() ||
        !!this.social()?.busy() ||
        !!this.uploadPanel()?.upload.busy ||
        !!this.uploadPanel()?.upload.unresolved,
    );
  }
}
