import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ModelLoadQueue {
  private readonly waiting: Array<() => void> = [];
  private current?: () => void;

  enqueue(start: () => void): () => void {
    this.waiting.push(start);
    this.next();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const index = this.waiting.indexOf(start);
      if (index >= 0) this.waiting.splice(index, 1);
      if (this.current === start) this.current = undefined;
      this.next();
    };
  }
  private next(): void {
    if (this.current) return;
    this.current = this.waiting.shift();
    this.current?.();
  }
}
