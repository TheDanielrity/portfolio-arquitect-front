import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, finalize, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDrawer } from './admin-drawer';
import { AdminNavigation } from './admin-navigation';
import { ADMIN_NAVIGATION } from './admin-navigation.config';

@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, AdminNavigation, AdminDrawer],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly drawer = viewChild(AdminDrawer);
  readonly user = this.auth.user;
  readonly loggingOut = signal(false);
  private readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );
  readonly pageLabel = computed(
    () =>
      ADMIN_NAVIGATION.find(
        (item) =>
          this.currentPath() === item.route ||
          (!item.exact && this.currentPath().startsWith(item.route + '/')),
      )?.label ?? 'Administración',
  );
  readonly userName = computed(() => {
    const user = this.user();
    return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email : '';
  });
  readonly skipHref = computed(() => this.currentPath() + '#admin-main');

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.drawer()?.close();
        this.focusContent();
      });
  }
  focusContent(event?: Event): void {
    event?.preventDefault();
    const main = this.content()?.nativeElement;
    main?.focus({ preventScroll: true });
    if (main) main.scrollTop = 0;
  }
  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.drawer()?.close();
    this.auth
      .logout()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loggingOut.set(false)),
      )
      .subscribe();
  }
}
