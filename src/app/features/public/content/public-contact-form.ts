import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, take, timer } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { PublicContentApi } from './public-content-api';
import { PublicContentState } from './public-content-state';

@Component({
  selector: 'app-public-contact-form',
  imports: [ReactiveFormsModule],
  templateUrl: './public-contact-form.html',
  styleUrl: './public-contact-form.scss',
})
export class PublicContactForm {
  readonly content = inject(PublicContentState);
  private readonly api = inject(PublicContentApi);
  private readonly destroy = inject(DestroyRef);
  readonly sending = signal(false);
  readonly received = signal(false);
  readonly error = signal('');
  readonly wait = signal(0);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(150)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(320)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: Validators.maxLength(50) }),
    subject: new FormControl('', { nonNullable: true, validators: Validators.maxLength(200) }),
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(10000)],
    }),
  });
  readonly fields = [
    {
      key: 'name',
      label: 'Name',
      type: 'text',
      autocomplete: 'name',
      max: 150,
      required: true,
      help: 'Enter your name (up to 150 characters).',
    },
    {
      key: 'email',
      label: 'Email',
      type: 'email',
      autocomplete: 'email',
      max: 320,
      required: true,
      help: 'Enter a valid email address (up to 320 characters).',
    },
    {
      key: 'phone',
      label: 'Phone',
      type: 'tel',
      autocomplete: 'tel',
      max: 50,
      required: false,
      help: 'Use up to 50 characters for your phone number.',
    },
    {
      key: 'subject',
      label: 'Subject',
      type: 'text',
      autocomplete: 'off',
      max: 200,
      required: false,
      help: 'Use up to 200 characters for the subject.',
    },
  ] as const;
  invalid(key: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[key];
    return control.invalid && control.touched;
  }
  reset(): void {
    this.received.set(false);
    this.error.set('');
    this.form.reset();
  }
  submit(): void {
    if (this.sending() || this.wait() > 0 || this.received() || !this.content.contactEnabled())
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.sending.set(true);
    this.error.set('');
    this.api
      .contact({
        name: value.name.trim(),
        email: value.email.trim(),
        phone: value.phone.trim() || null,
        subject: value.subject.trim() || null,
        message: value.message.trim(),
      })
      .pipe(
        finalize(() => this.sending.set(false)),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe({
        next: () => {
          this.received.set(true);
          this.form.reset();
        },
        error: (error: unknown) => {
          const status = error instanceof ApiError ? error.status : 0;
          this.error.set(
            status === 422
              ? 'Please review the highlighted fields and try again.'
              : status === 429
                ? 'Too many messages. Please wait before trying again.'
                : status === 400
                  ? 'Your message could not be accepted. Contact availability may have changed.'
                  : status === 0
                    ? 'Could not connect. Your message has not been confirmed; please try again.'
                    : 'Your message could not be confirmed. Please try again later.',
          );
          if (status === 422 && error instanceof ApiError) {
            for (const issue of error.validationIssues) {
              const key = issue.loc.filter((part) => part !== 'body')[0];
              if (typeof key === 'string' && Object.hasOwn(this.form.controls, key)) {
                this.form.controls[key as keyof typeof this.form.controls].setErrors({
                  backend: true,
                });
              }
            }
          }
          if (status === 400) this.content.settings.load();
          if (status === 429 && error instanceof ApiError) {
            const raw = error.retryAfter;
            const seconds =
              raw && /^\d+$/.test(raw)
                ? Number(raw)
                : raw
                  ? Math.ceil((Date.parse(raw) - Date.now()) / 1000)
                  : 0;
            if (Number.isFinite(seconds) && seconds > 0) {
              this.wait.set(seconds);
              timer(1000, 1000)
                .pipe(take(seconds), takeUntilDestroyed(this.destroy))
                .subscribe(() => this.wait.update((value) => Math.max(0, value - 1)));
            }
          }
        },
      });
  }
}
