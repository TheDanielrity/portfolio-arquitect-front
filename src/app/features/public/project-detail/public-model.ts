import {
  Component,
  afterRenderEffect,
  CUSTOM_ELEMENTS_SCHEMA,
  DestroyRef,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ModelViewerElement } from '@google/model-viewer';
import type { PublicMedia } from '../../../core/api/generated/types.gen';
import { PublicMediaDelivery } from './public-media-delivery';
import { modelStatistics } from './model-statistics';
import { framingDistance } from './model-camera';
import { ModelLoadQueue } from './model-load-queue';

@Component({
  selector: 'app-public-model',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './public-model.html',
  styleUrl: './public-model.scss',
})
export class PublicModel {
  readonly delivery = inject(PublicMediaDelivery);
  private readonly queue = inject(ModelLoadQueue);
  private cancelLoad?: () => void;
  readonly media = input.required<PublicMedia>();
  readonly current = this.media;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly viewer = viewChild<ElementRef<ModelViewerElement>>('viewer');
  readonly active = signal(false);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly loadError = signal('');
  readonly progress = signal(0);
  readonly unsupported = signal(false);
  readonly dimensions = signal('—');
  readonly triangles = signal<number | null>(null);
  readonly unitless = signal(false);
  readonly controlError = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loadStarted = 0;
  private generation = 0;
  private destroyed = false;
  private resize?: ResizeObserver;
  private proximity?: IntersectionObserver;
  private frame?: number;
  constructor() {
    afterRenderEffect(() => {
      this.media();
      untracked(() => {
        this.resetState();
        this.observeProximity();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
      clearTimeout(this.timer);
      this.proximity?.disconnect();
      this.releaseLoad();
      this.resize?.disconnect();
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    });
  }
  private resetState(): void {
    this.releaseLoad();
    this.proximity?.disconnect();
    this.generation++;
    this.resize?.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.active.set(false);
    this.loading.set(false);
    this.failed.set(false);
    this.loadError.set('');
    this.progress.set(0);
    this.unsupported.set(false);
    this.dimensions.set('—');
    this.triangles.set(null);
    this.unitless.set(false);
    this.controlError.set('');
  }
  private observeProximity(): void {
    if (!this.browser) return;
    if (typeof IntersectionObserver === 'undefined') {
      this.requestLoad();
      return;
    }
    const generation = this.generation;
    let entered = false;
    this.proximity = new IntersectionObserver(
      (entries) => {
        if (
          entered ||
          this.destroyed ||
          generation !== this.generation ||
          !entries.some((entry) => entry.isIntersecting)
        )
          return;
        entered = true;
        this.proximity?.disconnect();
        this.requestLoad();
      },
      { rootMargin: '200px 0px' },
    );
    this.proximity.observe(this.host.nativeElement);
  }
  requestLoad(): void {
    if (this.cancelLoad || this.destroyed) return;
    this.cancelLoad = this.queue.enqueue(() => {
      const attempt = this.open();
      const generation = this.generation;
      void attempt.then(() => {
        if (this.generation === generation && !this.loading()) this.releaseLoad();
      });
    });
  }
  private releaseLoad(): void {
    const cancel = this.cancelLoad;
    this.cancelLoad = undefined;
    cancel?.();
  }
  supported(): boolean {
    return this.current().type === 'MODEL_3D' && this.current().mime_type === 'model/gltf-binary';
  }
  webglAvailable(): boolean {
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      if (!context) return false;
      context.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  }
  async open(): Promise<void> {
    if (!this.browser || !this.supported() || this.loading() || this.destroyed) return;
    if (!this.webglAvailable()) {
      this.unsupported.set(true);
      return;
    }
    this.loading.set(true);
    this.failed.set(false);
    this.loadError.set('');
    this.progress.set(0);
    this.loadStarted = Date.now();
    const generation = ++this.generation;
    this.watchLoad();
    try {
      const { ModelViewerElement } = await import('@google/model-viewer');
      ModelViewerElement.meshoptDecoderLocation = new URL(
        'assets/meshopt/decoder-1.3.0.js',
        this.host.nativeElement.ownerDocument.baseURI,
      ).href;
      if (!this.destroyed && generation === this.generation && this.loading())
        this.active.set(true);
    } catch {
      if (generation === this.generation) this.fail();
    }
  }
  private watchLoad(): void {
    clearTimeout(this.timer);
    const remaining = 300000 - (Date.now() - this.loadStarted);
    this.timer = setTimeout(
      () => {
        this.fail();
        this.loadError.set(
          remaining <= 120000
            ? 'La carga superó los 5 minutos. Comprueba la conexión y vuelve a intentarlo.'
            : 'La carga no avanzó durante 2 minutos. Comprueba la conexión y vuelve a intentarlo.',
        );
      },
      Math.max(0, Math.min(120000, remaining)),
    );
  }
  onProgress(event: Event): void {
    if (!this.loading() || !(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (typeof detail !== 'object' || detail === null || !('totalProgress' in detail)) return;
    const value = detail.totalProgress;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return;
    if (value <= this.progress()) return;
    this.progress.set(value);
    this.watchLoad();
  }
  fail(): void {
    this.releaseLoad();
    this.unsupported.set(false);
    this.generation++;
    this.resize?.disconnect();
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.active.set(false);
    this.loading.set(false);
    this.failed.set(true);
    this.dimensions.set('—');
    this.triangles.set(null);
  }
  onViewerError(event: Event): void {
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    const contextLost =
      typeof detail === 'object' &&
      detail !== null &&
      'type' in detail &&
      detail.type === 'webglcontextlost';
    this.fail();
    this.loadError.set(
      contextLost
        ? 'El navegador perdió el contexto gráfico WebGL. Cierra otras pestañas y vuelve a intentarlo.'
        : 'El visor no pudo descargar o procesar el GLB. Comprueba la conexión y prueba con un navegador actualizado.',
    );
  }
  loaded(): void {
    const viewer = this.viewer()?.nativeElement;
    if (!viewer) return;
    const stats = modelStatistics(viewer.originalGltfJson);
    const size = viewer.getDimensions();
    this.unitless.set(stats.unitless);
    this.triangles.set(stats.triangles);
    const values = [size.x, size.y, size.z];
    this.dimensions.set(
      values.every((value) => Number.isFinite(value) && value >= 0)
        ? values
            .map((value) =>
              new Intl.NumberFormat('es', { maximumSignificantDigits: 5 }).format(value),
            )
            .join(' × ') + (stats.unitless ? ' u' : ' m')
        : 'No disponibles',
    );
    clearTimeout(this.timer);
    this.loading.set(false);
    this.resetCamera();
    this.releaseLoad();
    if (typeof ResizeObserver !== 'undefined') {
      this.resize?.disconnect();
      this.resize = new ResizeObserver(() => {
        if (this.frame !== undefined) cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.resetCamera());
      });
      this.resize.observe(viewer);
    }
  }
  rotate(direction: number): void {
    const viewer = this.viewer()?.nativeElement;
    if (!viewer) return;
    const orbit = viewer.getCameraOrbit();
    viewer.cameraOrbit = `${(orbit.theta * 180) / Math.PI + direction * 15}deg ${(orbit.phi * 180) / Math.PI}deg ${orbit.radius}m`;
  }
  zoom(amount: number): void {
    this.viewer()?.nativeElement.zoom(amount);
  }
  onKey(event: KeyboardEvent): void {
    // Native shadow controls already handle keys when their own canvas has focus.
    if (event.defaultPrevented) return;
    switch (event.key) {
      case 'ArrowLeft':
        this.rotate(-1);
        break;
      case 'ArrowRight':
        this.rotate(1);
        break;
      case 'PageUp':
      case '+':
        this.zoom(1);
        break;
      case 'PageDown':
      case '-':
        this.zoom(-1);
        break;
      case 'Home':
        this.resetCamera();
        break;
      case 'ArrowUp':
      case 'ArrowDown': {
        const viewer = this.viewer()?.nativeElement;
        if (!viewer) return;
        const orbit = viewer.getCameraOrbit();
        const phi = Math.min(
          175,
          Math.max(5, (orbit.phi * 180) / Math.PI + (event.key === 'ArrowUp' ? -10 : 10)),
        );
        viewer.cameraOrbit = `${(orbit.theta * 180) / Math.PI}deg ${phi}deg ${orbit.radius}m`;
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }
  resetCamera(): void {
    const viewer = this.viewer()?.nativeElement;
    if (!viewer) return;
    const rect = viewer.getBoundingClientRect();
    const distance = framingDistance(
      viewer.getDimensions(),
      rect.width / rect.height,
      viewer.getFieldOfView(),
    );
    viewer.cameraOrbit = distance > 0 ? `25deg 65deg ${distance}m` : '25deg 65deg auto';
    viewer.cameraTarget = 'auto auto auto';
    viewer.jumpCameraToGoal();
  }
  get fullscreenAvailable(): boolean {
    return this.browser && !!this.host.nativeElement.ownerDocument.fullscreenEnabled;
  }
  async fullscreen(): Promise<void> {
    try {
      const document = this.host.nativeElement.ownerDocument;
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.host.nativeElement.requestFullscreen();
    } catch {
      this.controlError.set('No se pudo activar la pantalla completa.');
    }
  }
}
