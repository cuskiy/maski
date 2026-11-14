import type { ChatState } from "../core/types.ts";

export type UiKey = keyof ChatState;

export interface Store {
  snapshot(): ChatState;
  read<K extends UiKey>(key: K): ChatState[K];
  write<K extends UiKey>(key: K, value: ChatState[K]): void;
  batch(mutate: () => void): void;
  watch(keys: readonly UiKey[], notify: (changed: ReadonlySet<UiKey>) => void): () => void;
  watchOne<K extends UiKey>(key: K, notify: (value: ChatState[K], previous: ChatState[K]) => void): () => void;
}

interface Watcher {
  readonly keys: ReadonlySet<UiKey>;
  readonly notify: (changed: ReadonlySet<UiKey>) => void;
}

export function createStore(initial: ChatState): Store {
  let state = initial;
  let batching = false;
  let flushing = false;
  const pending = new Set<UiKey>();
  const watchers = new Set<Watcher>();

  function flush(): void {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.size > 0) {
        const changed = new Set(pending);
        pending.clear();
        for (const watcher of watchers) {
          const hit = new Set<UiKey>();
          for (const key of changed) if (watcher.keys.has(key)) hit.add(key);
          if (hit.size > 0) watcher.notify(hit);
        }
      }
    } finally {
      flushing = false;
    }
  }

  function write<K extends UiKey>(key: K, value: ChatState[K]): void {
    if (Object.is(state[key], value)) return;
    state = { ...state, [key]: value };
    pending.add(key);
    if (!batching) flush();
  }

  return {
    snapshot: () => state,
    read: (key) => state[key],
    write,
    batch: (mutate) => {
      if (batching) {
        mutate();
        return;
      }
      batching = true;
      try {
        mutate();
      } finally {
        batching = false;
        flush();
      }
    },
    watch: (keys, notify) => {
      const watcher: Watcher = { keys: new Set<UiKey>(keys), notify };
      watchers.add(watcher);
      return () => {
        watchers.delete(watcher);
      };
    },
    watchOne: (key, notify) => {
      let previous = state[key];
      const wrapped: Watcher = {
        keys: new Set<UiKey>([key]),
        notify: () => {
          const next = state[key];
          if (Object.is(previous, next)) return;
          const old = previous;
          previous = next;
          notify(next, old);
        },
      };
      watchers.add(wrapped);
      return () => {
        watchers.delete(wrapped);
      };
    },
  };
}
