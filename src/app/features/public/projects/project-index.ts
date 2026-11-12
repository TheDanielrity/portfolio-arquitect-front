import {
  Component,
  computed,
  inject,
  afterNextRender,
  DOCUMENT,
  DestroyRef,
  signal,
  output,
  ElementRef,
  viewChild,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicProjectCollection, publicProjectError } from './public-project-collection';
import { PublicProjectQuery } from './public-projects-api';
import { ApiError } from '../../../core/api/api-error';
import { PublicCover } from './public-cover';
import type { PublicProjectCard } from '../../../core/api/generated/types.gen';
@Component({
  selector: 'app-project-index',
  imports: [RouterLink, PublicCover],
  templateUrl: './project-index.html',
  styleUrl: './project-index.scss',
})
export class ProjectIndex {
  readonly Math = Math;
  readonly collection = inject(PublicProjectCollection);
  readonly title = input(true);
  readonly changed = output<PublicProjectQuery>();
  readonly errorMessage = computed(() => publicProjectError(this.collection.error()));
  readonly retryAfter = computed(() => {
    const e = this.collection.error();
    return e instanceof ApiError ? e.retryAfter : null;
  });
  readonly filtered = computed(
    () => !!(this.collection.query().category || this.collection.query().tag),
  );
  readonly preview = signal<PublicProjectCard | null>(null);
  readonly point = signal({ x: 0, y: 0 });
  readonly previewEnabled = signal(false);
  readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly document = inject(DOCUMENT);
  private frame = 0;
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const view = this.document.defaultView;
      if (!view?.matchMedia) return;
      const pointer = view.matchMedia('(min-width:64rem) and (hover:hover) and (pointer:fine)');
      const reduced = view.matchMedia('(prefers-reduced-motion:reduce)');
      const update = () => {
        this.previewEnabled.set(pointer.matches && !reduced.matches);
        if (!this.previewEnabled()) this.preview.set(null);
      };
      update();
      pointer.addEventListener('change', update);
      reduced.addEventListener('change', update);
      destroy.onDestroy(() => {
        pointer.removeEventListener('change', update);
        reduced.removeEventListener('change', update);
        view.cancelAnimationFrame(this.frame);
      });
    });
  }
  filter(category: string | null): void {
    if (this.collection.loading()) return;
    this.hidePreview();
    this.changed.emit({ ...this.collection.query(), category, offset: 0 });
  }
  paginate(offset: number): void {
    if (this.collection.loading()) return;
    this.hidePreview();
    this.changed.emit({ ...this.collection.query(), offset });
    this.heading()?.nativeElement.focus();
  }
  move(event: PointerEvent, project: PublicProjectCard): void {
    const view = this.document.defaultView;
    if (
      !this.previewEnabled() ||
      event.pointerType === 'touch' ||
      !view ||
      project.cover?.type !== 'IMAGE'
    )
      return;
    view.cancelAnimationFrame(this.frame);
    this.frame = view.requestAnimationFrame(() => {
      this.point.set({
        x: Math.max(12, Math.min(event.clientX + 30, view.innerWidth - 332)),
        y: Math.max(100, Math.min(event.clientY - 220, view.innerHeight - 212)),
      });
      this.preview.set(project);
    });
  }
  hidePreview(): void {
    this.document.defaultView?.cancelAnimationFrame(this.frame);
    this.preview.set(null);
  }
}
