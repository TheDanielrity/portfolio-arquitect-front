import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly retryAfter = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.maxLength(320)]],
    password: ['', [Validators.required, Validators.maxLength(1024)]],
  });
  invalid(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }
  submit(): void {
    if (this.busy()) return;
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    this.retryAfter.set(null);
    this.auth
      .login(this.form.getRawValue())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busy.set(false);
          this.form.controls.password.reset();
        }),
      )
      .subscribe({
        next: () => {
          void this.router.navigateByUrl('/admin');
        },
        error: (error: unknown) => {
          if (error instanceof ApiError) {
            this.retryAfter.set(error.retryAfter);
            for (const issue of error.validationIssues) {
              const field = issue.loc[1];
              if (field === 'email' || field === 'password')
                this.form.controls[field].setErrors({ backend: true });
            }
            const messages: Record<number, string> = {
              0: 'No pudimos conectar. Comprueba tu conexión e inténtalo de nuevo.',
              401: 'No se pudo iniciar sesión con esos datos.',
              403: 'No se pudo autorizar el acceso.',
              422: 'Revisa el correo y la contraseña.',
              429: 'Demasiados intentos. Espera antes de volver a intentar.',
            };
            this.error.set(
              messages[error.status] ?? 'No pudimos iniciar sesión. Inténtalo más tarde.',
            );
          } else {
            this.error.set('No pudimos iniciar sesión. Inténtalo más tarde.');
          }
        },
      });
  }
}
