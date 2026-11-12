export interface KeyedOptions<T> {
  key: (item: T) => string;
  create: (item: T) => HTMLElement;
  update?: (node: HTMLElement, item: T) => void;
  remove?: (node: HTMLElement) => void;
}

interface Entry<T> {
  node: HTMLElement;
  item: T;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((key, index) => key === right[index]);
}

export class KeyedList<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly container: HTMLElement;
  private readonly options: KeyedOptions<T>;
  private order: string[] = [];

  constructor(container: HTMLElement, options: KeyedOptions<T>) {
    this.container = container;
    this.options = options;
  }

  render(items: readonly T[]): void {
    const nextOrder: string[] = [];
    for (const item of items) {
      const key = this.options.key(item);
      nextOrder.push(key);
      const existing = this.entries.get(key);
      if (existing) {
        if (existing.item !== item) {
          existing.item = item;
          this.options.update?.(existing.node, item);
        }
      } else {
        const node = this.options.create(item);
        this.entries.set(key, { node, item });
      }
    }
    const wanted = new Set(nextOrder);
    for (const [key, entry] of this.entries) {
      if (!wanted.has(key)) {
        this.options.remove?.(entry.node);
        entry.node.remove();
        this.entries.delete(key);
      }
    }
    if (!sameOrder(this.order, nextOrder)) this.place(nextOrder);
    this.order = nextOrder;
  }

  // Moving a node detaches it, which drops focus and restarts media: only touch
  // the DOM when the order actually differs from what is already there.
  private place(order: readonly string[]): void {
    let reference: Node | null = this.container.firstChild;
    for (const key of order) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      if (entry.node === reference) {
        reference = reference.nextSibling;
        continue;
      }
      this.container.insertBefore(entry.node, reference);
    }
  }

  get keys(): readonly string[] {
    return this.order;
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.options.remove?.(entry.node);
      entry.node.remove();
    }
    this.entries.clear();
    this.order = [];
  }
}
