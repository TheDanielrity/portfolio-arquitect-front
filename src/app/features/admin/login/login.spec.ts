import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { ApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { Login } from './login';

describe('Login form', () => {
  const user = { id: 'id', email: 'a@b.test', first_name: 'A', last_name: 'B', is_active: true };
  let response: Subject<typeof user>;
  let calls: number;
  beforeEach(() => {
    response = new Subject();
    calls = 0;
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            login: () => {
              calls++;
              return response;
            },
          },
        },
      ],
    });
  });
  it('validates required fields without HTTP', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.componentInstance.submit();
    fixture.detectChanges();
    expect(calls).toBe(0);
    expect(fixture.nativeElement.querySelector('#email').getAttribute('aria-invalid')).toBe('true');
  });
  it('blocks duplicate submissions and navigates after success', () => {
    const fixture = TestBed.createComponent(Login);
    const component = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    component.form.setValue({ email: 'a@b.test', password: 'secret' });
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(calls).toBe(1);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    response.next(user);
    response.complete();
    expect(navigate).toHaveBeenCalledWith('/admin');
    expect(component.busy()).toBe(false);
    expect(component.form.controls.password.value).toBe('');
  });
  for (const status of [0, 401, 403, 422, 429, 500]) {
    it('handles HTTP ' + status + ' without exposing internal errors', () => {
      TestBed.overrideProvider(AuthService, {
        useValue: {
          login: () =>
            throwError(
              () =>
                new ApiError(
                  status,
                  'SECRET INTERNAL ERROR',
                  [],
                  status === 429 ? '30' : null,
                  'private-id',
                ),
            ),
        },
      });
      const fixture = TestBed.createComponent(Login);
      const component = fixture.componentInstance;
      component.form.setValue({ email: 'a@b.test', password: 'secret' });
      component.submit();
      fixture.detectChanges();
      expect(component.busy()).toBe(false);
      expect(component.error()).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('SECRET INTERNAL ERROR');
      expect(fixture.nativeElement.textContent).not.toContain('private-id');
      expect(component.retryAfter()).toBe(status === 429 ? '30' : null);
    });
  }
});
