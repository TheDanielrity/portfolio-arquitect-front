import { DOCUMENT } from '@angular/common';
import { afterNextRender, DestroyRef, Directive, ElementRef, inject } from '@angular/core';
@Directive({ selector: '[appPublicReveal]', host: { class: 'public-reveal' } })
export class PublicReveal {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const document = inject(DOCUMENT),
      destroy = inject(DestroyRef);
    afterNextRender(() => {
      const view = document.defaultView;
      if (!view?.IntersectionObserver || !view.matchMedia) return;
      const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
      if (reduced.matches) return;
      const observer = new view.IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            element.classList.remove('reveal-pending');
            observer.disconnect();
          }
        },
        { threshold: 0.08 },
      );
      const changed = () => {
        if (reduced.matches) {
          element.classList.remove('reveal-pending');
          observer.disconnect();
        }
      };
      // Enhance only offscreen content; SSR/no-JS and already visible content stay visible.
      if (element.getBoundingClientRect().top > view.innerHeight) {
        element.classList.add('reveal-pending');
        observer.observe(element);
      }
      reduced.addEventListener('change', changed);
      destroy.onDestroy(() => {
        observer.disconnect();
        reduced.removeEventListener('change', changed);
        element.classList.remove('reveal-pending');
      });
    });
  }
}
