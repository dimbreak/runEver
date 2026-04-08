type ResolveValue<T> = { value: T | undefined; done: boolean };

export class AsyncQueue<T> {
  items: T[] = [];
  closed = false;
  error: Error | null = null;
  resolvers: ((v: ResolveValue<T> | PromiseLike<ResolveValue<T>>) => void)[] =
    [];

  push(item: T) {
    if (this.closed) return;
    if (this.resolvers.length)
      this.resolvers.shift()?.({ value: item, done: false });
    else this.items.push(item);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    while (this.resolvers.length)
      this.resolvers.shift()?.({ value: undefined, done: true });
  }

  fail(err: Error) {
    this.error = err;
    this.close();
  }

  async next() {
    if (this.error) throw this.error;
    if (this.items.length) return { value: this.items.shift(), done: false };
    if (this.closed) return { value: undefined, done: true };
    return new Promise<ResolveValue<T>>((resolve) =>
      this.resolvers.push(resolve),
    );
  }

  [Symbol.asyncIterator]() {
    return { next: () => this.next() };
  }
}
