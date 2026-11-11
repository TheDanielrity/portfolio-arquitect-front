import { TestBed } from '@angular/core/testing';
import { API_BASE_URL } from '../../../core/api/api-config';
import { card } from '../projects/public-projects.testing';
import { modelStatistics } from './model-statistics';
import { PublicModel } from './public-model';
import { framingDistance } from './model-camera';

const model = { ...card.cover!, type: 'MODEL_3D' as const, mime_type: 'model/gltf-binary' };
const scene = () => ({
  scene: 0,
  scenes: [{ nodes: [0, 1] }],
  nodes: [{ mesh: 0 }, { mesh: 0 }],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0 } }, { indices: 1, mode: 5 }] },
    { primitives: [{ attributes: { POSITION: 2 } }] },
  ],
  accessors: [{ count: 6 }, { count: 5 }, { count: 999 }],
});
describe('Real model metrics', () => {
  it('fits the camera proportionally without changing the model and adapts to portrait screens', () => {
    const size = { x: 60, y: 12, z: 24 };
    expect(framingDistance(size, 0.7, 30)).toBeGreaterThan(framingDistance(size, 2.5, 30));
    expect(framingDistance({ x: 120, y: 24, z: 48 }, 2.5, 30)).toBeCloseTo(
      2 * framingDistance(size, 2.5, 30),
    );
    expect(size).toEqual({ x: 60, y: 12, z: 24 });
  });
  it('counts indexed and non-indexed scene instances while excluding unused meshes', () => {
    expect(modelStatistics(scene())).toEqual({ triangles: 10, unitless: false });
  });
  it('marks converted STL as unitless and does not invent counts without data', () => {
    expect(
      modelStatistics({ asset: { extras: { portfolioStl: { units: 'unspecified' } } } }),
    ).toEqual({ triangles: null, unitless: true });
    expect(modelStatistics(null).triangles).toBeNull();
  });
  it('does not invent statistics for unsupported GPU instancing or cyclic graphs', () => {
    expect(
      modelStatistics({
        ...scene(),
        nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: {} } }],
      }).triangles,
    ).toBeNull();
    expect(modelStatistics({ ...scene(), nodes: [{ children: [0] }] }).triangles).toBeNull();
  });
});
describe('Architectural model viewer', () => {
  beforeEach(() => vi.spyOn(PublicModel.prototype, 'webglAvailable').mockReturnValue(false));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [{ provide: API_BASE_URL, useValue: 'https://api.test/api/v1' }],
    }),
  );
  function create() {
    const fixture = TestBed.createComponent(PublicModel);
    fixture.componentRef.setInput('media', model);
    fixture.detectChanges();
    return fixture;
  }
  it('waits for proximity without loading distant models and opens automatically only once', () => {
    let notify!: IntersectionObserverCallback;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const open = vi.spyOn(PublicModel.prototype, 'open').mockResolvedValue(undefined);
    const fixture = create();
    expect(observe).toHaveBeenCalledWith(fixture.nativeElement);
    expect(open).not.toHaveBeenCalled();
    const entry = (isIntersecting: boolean) =>
      notify([{ isIntersecting }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    entry(false);
    expect(open).not.toHaveBeenCalled();
    entry(true);
    entry(true);
    expect(open).toHaveBeenCalledOnce();
    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
  });
  it('ignores queued visibility notifications for replaced assets or destroyed sections', () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback);
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    const open = vi.spyOn(PublicModel.prototype, 'open').mockResolvedValue(undefined);
    const fixture = create();
    fixture.componentRef.setInput('media', { ...model, url: 'https://test/new' });
    fixture.detectChanges();
    callbacks[0](
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(open).not.toHaveBeenCalled();
    fixture.destroy();
    callbacks[1](
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
    expect(open).not.toHaveBeenCalled();
  });
  it('keeps an advancing mobile load alive beyond 60 seconds and detects a stall', () => {
    const fixture = create();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      fixture.componentInstance.loading.set(true);
      const progress = (value: number) =>
        fixture.componentInstance.onProgress(
          new CustomEvent('progress', { detail: { totalProgress: value } }),
        );
      progress(0.1);
      vi.advanceTimersByTime(61000);
      expect(fixture.componentInstance.failed()).toBe(false);
      progress(0.5);
      vi.advanceTimersByTime(119000);
      expect(fixture.componentInstance.failed()).toBe(false);
      progress(0.5);
      progress(Number.NaN);
      vi.advanceTimersByTime(1000);
      expect(fixture.componentInstance.loadError()).toContain('no avanzó durante 2 minutos');
      expect(fixture.componentInstance.progress()).toBe(0.5);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });
  it('bounds continuously advancing loads to five minutes and ignores late progress', () => {
    const fixture = create();
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      fixture.componentInstance.loading.set(true);
      for (let step = 1; step <= 5; step++) {
        fixture.componentInstance.onProgress(
          new CustomEvent('progress', {
            detail: { totalProgress: step / 10 },
          }),
        );
        vi.advanceTimersByTime(60000);
      }
      expect(fixture.componentInstance.loadError()).toContain('superó los 5 minutos');
      fixture.componentInstance.onProgress(
        new CustomEvent('progress', {
          detail: { totalProgress: 1 },
        }),
      );
      expect(fixture.componentInstance.progress()).toBe(0.5);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      fixture.destroy();
      vi.useRealTimers();
    }
  });
  it.each([
    ['webglcontextlost', 'perdió el contexto gráfico WebGL'],
    ['loadfailure', 'no pudo descargar o procesar el GLB'],
  ])('explains viewer error %s without exposing the source error', (type, message) => {
    const fixture = create();
    fixture.componentInstance.active.set(true);
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('model-viewer')
      .dispatchEvent(
        new CustomEvent('error', { detail: { type, sourceError: 'private signed URL' } }),
      );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(message);
    expect(fixture.nativeElement.textContent).not.toContain('private signed URL');
    expect(fixture.nativeElement.querySelector('model-viewer')).toBeNull();
    expect(fixture.nativeElement.querySelector('.activate')).not.toBeNull();
  });
  it('automatically opens its own model after rendering, without activation or selector buttons', () => {
    const open = vi.spyOn(PublicModel.prototype, 'open').mockResolvedValue(undefined);
    const fixture = create();
    expect(open).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.activate')).toBeNull();
    expect(fixture.nativeElement.querySelector('.model-selector')).toBeNull();
    expect(fixture.componentInstance.dimensions()).toBe('—');
    expect(fixture.nativeElement.textContent).not.toContain('1 : 100');
  });
  it('loads a changed section asset and does not automatically retry failures', () => {
    const open = vi.spyOn(PublicModel.prototype, 'open').mockResolvedValue(undefined);
    const fixture = create();
    fixture.componentRef.setInput('media', { ...model, url: 'https://test/model2' });
    fixture.detectChanges();
    expect(open).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.current().url).toBe('https://test/model2');
    fixture.componentInstance.fail();
    fixture.detectChanges();
    expect(open).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('.activate').textContent).toContain('Reintentar');
  });
  it('offers GLB download on devices without WebGL', async () => {
    const fixture = create();
    vi.spyOn(fixture.componentInstance, 'webglAvailable').mockReturnValue(false);
    await fixture.componentInstance.open();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no admite WebGL 2');
    expect(fixture.nativeElement.querySelector('a').textContent).toContain('Descargar GLB');
    expect(fixture.nativeElement.querySelector('model-viewer')).toBeNull();
  });
  it('reads measured dimensions and actual triangle counts without physical STL units', () => {
    const fixture = create();
    fixture.componentInstance.active.set(true);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('model-viewer');
    element.getDimensions = () => ({ x: 1000, y: 2000, z: 3000 });
    element.getFieldOfView = () => 30;
    element.jumpCameraToGoal = vi.fn();
    element.originalGltfJson = {
      ...scene(),
      asset: { extras: { portfolioStl: { units: 'unspecified' } } },
    };
    element.dispatchEvent(new Event('load'));
    fixture.detectChanges();
    expect(fixture.componentInstance.triangles()).toBe(10);
    expect(fixture.componentInstance.dimensions()).toContain(' u');
    expect(fixture.nativeElement.textContent).toContain('sin unidad física');
    expect(fixture.nativeElement.textContent).not.toContain('cm');
    expect(
      fixture.nativeElement.querySelectorAll('.model-controls button').length,
    ).toBeGreaterThanOrEqual(5);
  });
  it('rotates and resets only the camera, preserving geometry', () => {
    const fixture = create();
    fixture.componentInstance.active.set(true);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('model-viewer');
    element.getCameraOrbit = () => ({ theta: 0, phi: Math.PI / 2, radius: 5 });
    element.getDimensions = () => ({ x: 1, y: 2, z: 3 });
    element.getFieldOfView = () => 30;
    element.jumpCameraToGoal = vi.fn();
    element.zoom = vi.fn();
    fixture.componentInstance.rotate(1);
    expect(element.cameraOrbit).toBe('15deg 90deg 5m');
    fixture.componentInstance.zoom(1);
    expect(element.zoom).toHaveBeenCalledWith(1);
    fixture.componentInstance.resetCamera();
    expect(element.cameraOrbit).toContain('auto');
    expect(element.scale).toBeUndefined();
    expect(element.orientation).toBeUndefined();
  });
  it('handles host keyboard focus without double handling native shadow controls', () => {
    const fixture = create();
    const rotate = vi.spyOn(fixture.componentInstance, 'rotate');
    const key = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    fixture.componentInstance.onKey(key);
    expect(rotate).toHaveBeenCalledWith(1);
    expect(key.defaultPrevented).toBe(true);
    fixture.componentInstance.onKey(key);
    expect(rotate).toHaveBeenCalledOnce();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    fixture.componentInstance.onKey(tab);
    expect(tab.defaultPrevented).toBe(false);
  });
});
