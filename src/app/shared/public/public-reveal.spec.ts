import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PublicReveal } from './public-reveal';
@Component({
  imports: [PublicReveal],
  template: '<section appPublicReveal>Visible server content</section>',
})
class Example {}
describe('Public reveal progressive enhancement', () => {
  let reduced: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let observer: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  let callback: IntersectionObserverCallback;
  let changed: () => void;
  beforeEach(() => {
    reduced = {
      matches: false,
      addEventListener: vi.fn((_: string, fn: () => void) => (changed = fn)),
      removeEventListener: vi.fn(),
    };
    observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observer.observe;
        disconnect = observer.disconnect;
        constructor(fn: IntersectionObserverCallback) {
          callback = fn;
        }
      },
    );
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => reduced),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('leaves content visible when observer is unavailable', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const f = TestBed.createComponent(Example);
    f.detectChanges();
    await f.whenStable();
    expect(f.nativeElement.querySelector('section').classList.contains('reveal-pending')).toBe(
      false,
    );
  });
  it('never hides content with reduced motion', async () => {
    reduced.matches = true;
    const f = TestBed.createComponent(Example);
    f.detectChanges();
    await f.whenStable();
    expect(observer.observe).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Visible server content');
  });
  it('leaves already visible content unchanged', async () => {
    const f = TestBed.createComponent(Example);
    f.detectChanges();
    await f.whenStable();
    expect(observer.observe).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('section').classList.contains('reveal-pending')).toBe(
      false,
    );
  });
  it('reveals offscreen content once and disconnects observer', async () => {
    const f = TestBed.createComponent(Example);
    const el = f.nativeElement.querySelector('section') as HTMLElement;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    f.detectChanges();
    await f.whenStable();
    expect(el.classList.contains('reveal-pending')).toBe(true);
    callback([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(el.classList.contains('reveal-pending')).toBe(false);
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
  it('changing reduced motion immediately restores visibility', async () => {
    const f = TestBed.createComponent(Example);
    const el = f.nativeElement.querySelector('section') as HTMLElement;
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 5000 } as DOMRect);
    f.detectChanges();
    await f.whenStable();
    reduced.matches = true;
    changed();
    expect(el.classList.contains('reveal-pending')).toBe(false);
    expect(observer.disconnect).toHaveBeenCalled();
  });
  it('destruction disconnects observer and removes media listener', async () => {
    const f = TestBed.createComponent(Example);
    f.detectChanges();
    await f.whenStable();
    f.destroy();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(reduced.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
