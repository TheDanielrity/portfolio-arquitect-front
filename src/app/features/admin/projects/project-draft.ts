import { computed, Injectable, signal } from '@angular/core';
import { concatMap, defer, finalize, Observable, of, tap } from 'rxjs';
import { Paginated } from '../../../core/api/pagination';

interface PendingChange {
  key?: string;
  priority: number;
  label: string;
  write: () => Observable<unknown>;
}

/** One editing session. Successful writes are removed before retrying a partial save. */
@Injectable()
export class ProjectDraft {
  private readonly changes = signal<PendingChange[]>([]);
  private readonly identities = new Map<string, string>();
  private sequence = 0;
  private readonly resets: (() => void)[] = [];
  readonly pending = computed(() => this.changes().length > 0);
  readonly saving = signal(false);
  readonly failure = signal('');
  readonly revision = signal(0);

  onReset(reset: () => void): void {
    this.resets.push(reset);
  }

  reset(): void {
    this.changes.set([]);
    this.identities.clear();
    this.failure.set('');
    for (const reset of this.resets) reset();
  }

  refresh(): void {
    for (const reset of this.resets) reset();
    this.revision.update((v) => v + 1);
  }

  temporaryId(): string {
    return 'draft-' + ++this.sequence;
  }

  resolve(id: string): string {
    return this.identities.get(id) ?? id;
  }

  isNew(id: string): boolean {
    return id.startsWith('draft-') && !this.identities.has(id);
  }

  discard(key: string): void {
    this.changes.update((changes) => changes.filter((change) => change.key !== key));
    this.revision.update((v) => v + 1);
  }

  identify(temporary: string, actual: string): void {
    this.identities.set(temporary, actual);
  }

  stage<T>(
    label: string,
    preview: T,
    write: () => Observable<unknown>,
    key?: string,
    priority = 0,
  ): Observable<T> {
    return defer(() => {
      if (this.saving()) throw new Error('Espera a que termine el guardado.');
      this.changes.update((changes) => {
        const change = { label, write, key, priority };
        const index = key ? changes.findIndex((item) => item.key === key) : -1;
        return index < 0
          ? [...changes, change]
          : changes.map((item, i) => (i === index ? change : item));
      });
      this.failure.set('');
      this.revision.update((v) => v + 1);
      return of(preview);
    });
  }

  commit(): Observable<void> {
    return defer(() => {
      if (this.saving()) throw new Error('Ya hay un guardado en curso.');
      this.saving.set(true);
      this.failure.set('');
      return this.next().pipe(finalize(() => this.saving.set(false)));
    });
  }

  private next(): Observable<void> {
    return defer(() => {
      const change = [...this.changes()].sort((a, b) => a.priority - b.priority)[0];
      if (!change) return of(undefined);
      this.failure.set(change.label);
      return change.write().pipe(
        tap(() => {
          this.changes.update((changes) => changes.filter((item) => item !== change));
          this.failure.set('');
        }),
        concatMap(() => this.next()),
      );
    });
  }
}

/** Complete local collection; pagination never discards pending previews. */
export class DraftCollection<T> {
  private readonly collections = new Map<string, T[]>();

  clear(): void {
    this.collections.clear();
  }

  has(key: string): boolean {
    return this.collections.has(key);
  }

  list(key: string, offset: number, load: () => Observable<T[]>): Observable<Paginated<T>> {
    return defer(() => {
      const cached = this.collections.get(key);
      const source = cached ? of(cached) : load().pipe(tap((items) => this.set(key, items)));
      return source.pipe(
        concatMap((items) =>
          of({ items: items.slice(offset, offset + 100), total: items.length, offset, limit: 100 }),
        ),
      );
    });
  }

  get(key: string): T[] {
    return this.collections.get(key) ?? [];
  }

  set(key: string, items: T[]): void {
    this.collections.set(key, items);
  }
}
