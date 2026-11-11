import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT, inject, Injectable, PLATFORM_ID } from '@angular/core';
@Injectable({ providedIn: 'root' })
export class MediaBrowser {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  create(blob: Blob): string | null {
    return this.browser ? (this.document.defaultView?.URL.createObjectURL(blob) ?? null) : null;
  }
  revoke(url: string | null): void {
    if (this.browser && url) this.document.defaultView?.URL.revokeObjectURL(url);
  }
  warnBeforeUnload(hasChanges: () => boolean): () => void {
    const view = this.browser ? this.document.defaultView : null;
    if (!view) return () => {};
    const listener = (event: BeforeUnloadEvent) => {
      if (!hasChanges()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    view.addEventListener('beforeunload', listener);
    return () => view.removeEventListener('beforeunload', listener);
  }
  download(url: string, name: string): void {
    if (!this.browser) return;
    const link = this.document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener noreferrer';
    link.target = '_blank';
    link.click();
  }
}
