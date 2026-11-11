import { ModelLoadQueue } from './model-load-queue';

describe('Public model load queue', () => {
  it('loads one model at a time and continues after success or failure releases the slot', () => {
    const queue = new ModelLoadQueue();
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    const releaseFirst = queue.enqueue(first);
    const releaseSecond = queue.enqueue(second);
    queue.enqueue(third);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    releaseFirst();
    expect(second).toHaveBeenCalledOnce();
    releaseFirst();
    expect(third).not.toHaveBeenCalled();
    releaseSecond();
    expect(third).toHaveBeenCalledOnce();
  });
  it('removes destroyed or replaced sections from the waiting queue', () => {
    const queue = new ModelLoadQueue();
    const release = queue.enqueue(vi.fn());
    const removed = vi.fn();
    const next = vi.fn();
    const cancel = queue.enqueue(removed);
    queue.enqueue(next);
    cancel();
    release();
    expect(removed).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
