import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Observable } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import type {
  PublicProfile,
  PublicService,
  PublicSetting,
  PublicSocialLink,
} from '../../../core/api/generated/types.gen';
import { PublicContentApi } from './public-content-api';

export function publicUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export class ContentResource<T> {
  readonly value = signal<T | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly loaded = signal(false);
  constructor(
    private readonly request: () => Observable<T>,
    private readonly destroy: DestroyRef,
    private readonly missingIsEmpty = false,
  ) {}
  load(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(false);
    this.request()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: (value) => {
          this.value.set(value);
          this.loaded.set(true);
        },
        error: (error: unknown) => {
          if (this.missingIsEmpty && error instanceof ApiError && error.status === 404) {
            this.value.set(null);
            this.loaded.set(true);
          } else this.error.set(true);
        },
      });
  }
}

@Injectable({ providedIn: 'root' })
export class PublicContentState {
  private readonly api = inject(PublicContentApi);
  private readonly destroy = inject(DestroyRef);
  readonly profile = new ContentResource<PublicProfile>(
    () => this.api.profile(),
    this.destroy,
    true,
  );
  readonly services = new ContentResource<PublicService[]>(
    () => this.api.allServices(),
    this.destroy,
  );
  readonly socials = new ContentResource<PublicSocialLink[]>(
    () => this.api.allSocialLinks(),
    this.destroy,
  );
  readonly settings = new ContentResource<PublicSetting[]>(() => this.api.settings(), this.destroy);
  readonly name = computed(() => {
    const profile = this.profile.value();
    return profile
      ? [profile.first_name, profile.last_name].filter(Boolean).join(' ')
      : this.siteTitle() || 'Portafolio';
  });
  readonly siteTitle = computed(() => {
    const value = this.settings.value()?.find((setting) => setting.key === 'site_title')?.value;
    return typeof value === 'string' ? value : null;
  });
  readonly links = computed(() =>
    (this.socials.value() ?? []).flatMap((link) => {
      const url = publicUrl(link.url);
      return url ? [{ ...link, url }] : [];
    }),
  );
  readonly contactEnabled = computed(() => {
    if (!this.settings.loaded() || this.settings.loading() || this.settings.error()) return false;
    const setting = this.settings.value()?.find((item) => item.key === 'contact_enabled');
    return !setting || setting.value === true;
  });
  readonly whatsappHref = computed(() => {
    if (this.socials.error() || this.socials.loading()) return null;
    const link = this.links().find((item) => {
      if (item.platform.trim().toLowerCase() !== 'whatsapp') return false;
      const url = new URL(item.url);
      return (
        url.protocol === 'https:' &&
        !url.port &&
        ((url.hostname === 'wa.me' && /^\/[1-9]\d{6,14}\/?$/.test(url.pathname)) ||
          (['api.whatsapp.com', 'web.whatsapp.com', 'www.whatsapp.com'].includes(url.hostname) &&
            url.pathname === '/send' &&
            /^[1-9]\d{6,14}$/.test(url.searchParams.get('phone') ?? '')))
      );
    });
    return link?.url ?? null;
  });
  readonly emailHref = computed(() => {
    const email = this.profile.value()?.email;
    return email ? 'mailto:' + encodeURIComponent(email) : null;
  });
  readonly phoneHref = computed(() => {
    const phone = this.profile.value()?.phone?.replace(/[^+\d]/g, '');
    return phone ? 'tel:' + phone : null;
  });
  constructor() {
    this.profile.load();
    this.services.load();
    this.socials.load();
    this.settings.load();
  }
}
