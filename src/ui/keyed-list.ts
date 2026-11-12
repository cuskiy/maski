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
    const fragment = document.createDocumentFragment();
    for (const key of nextOrder) {
      const entry = this.entries.get(key);
      if (entry) fragment.appendChild(entry.node);
    }
    this.container.replaceChildren(fragment);
    this.order = nextOrder;
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
