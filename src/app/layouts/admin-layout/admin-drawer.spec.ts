import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDrawer } from './admin-drawer';

describe('Responsive administrative drawer state', () => {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const media = {
    matches: false,
    media: '(min-width: 64rem)',
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) =>
      listeners.add(listener),
    ),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) =>
      listeners.delete(listener),
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  let original: typeof window.matchMedia;
  beforeEach(() => {
    original = window.matchMedia;
    window.matchMedia = vi.fn(() => media);
    media.matches = false;
    listeners.clear();
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [AdminDrawer], providers: [provideRouter([])] });
  });
  afterEach(() => {
    window.matchMedia = original;
  });
  async function create() {
    const fixture = TestBed.createComponent(AdminDrawer);
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const show = vi.fn(() => dialog.setAttribute('open', ''));
    const close = vi.fn(() => dialog.removeAttribute('open'));
    Object.defineProperty(dialog, 'showModal', { value: show });
    Object.defineProperty(dialog, 'close', { value: close });
    return { fixture, drawer: fixture.componentInstance, dialog, show, close };
  }
  it('starts closed and opens the native modal only once', async () => {
    const { drawer, show } = await create();
    expect(drawer.opened()).toBe(false);
    drawer.open();
    drawer.open();
    expect(show).toHaveBeenCalledTimes(1);
    expect(drawer.opened()).toBe(true);
    drawer.close();
    expect(drawer.opened()).toBe(false);
  });
  it('handles Escape cancellation and native close without stale expanded state', async () => {
    const { drawer, dialog } = await create();
    drawer.open();
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(drawer.opened()).toBe(false);
    drawer.open();
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
    expect(drawer.opened()).toBe(false);
  });
  it('ignores a queued close event after reopening and still closes on desktop', async () => {
    const { drawer, dialog } = await create();
    drawer.open();
    drawer.close();
    drawer.open();
    dialog.dispatchEvent(new Event('close'));
    expect(drawer.opened()).toBe(true);
    media.matches = true;
    for (const listener of listeners) {
      if (typeof listener === 'function') listener(new Event('change'));
    }
    expect(dialog.open).toBe(false);
    expect(drawer.opened()).toBe(false);
  });
  it('closes on transition to desktop and removes its viewport listener on destroy', async () => {
    const { fixture, drawer } = await create();
    const desktop = vi.fn();
    drawer.desktop.subscribe(desktop);
    drawer.open();
    media.matches = true;
    for (const listener of listeners) {
      if (typeof listener === 'function') listener(new Event('change'));
    }
    expect(drawer.opened()).toBe(false);
    expect(desktop).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(media.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
