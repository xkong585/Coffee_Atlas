import type { ItemReference, SavedItem } from "@/contracts";
import { callApi, dataOf } from "./client";

const keyOf = ({ itemType, itemId }: ItemReference) => `${itemType}:${itemId}`;
const listeners = new Set<() => void>();
let keys: Set<string> | null = null;
const changes = new Map<string, boolean>();
let pending: Promise<void> | null = null;
let generation = 0;

function notify() {
  for (const listener of listeners) listener();
}

function clear() {
  generation += 1;
  keys = null;
  changes.clear();
  pending = null;
}

/** Shared only while save buttons are mounted; failures can be retried on the next mount. */
function load(): Promise<void> {
  if (pending) return pending;
  const current = generation;
  pending = callApi<SavedItem[]>("/api/saved").then((reply) => {
    if (current !== generation) return;
    const items = dataOf(reply);
    keys = items ? new Set(items.map(keyOf)) : null;
    if (keys) {
      // A GET started before a save may return an older list. Keep confirmed writes.
      for (const [key, saved] of changes) {
        if (saved) keys.add(key);
        else keys.delete(key);
      }
      changes.clear();
    }
    notify();
  }).finally(() => {
    if (current === generation) pending = null;
  });
  return pending;
}

export const savedState = {
  load,
  version: () => generation,
  read(item: ItemReference): boolean | null {
    const key = keyOf(item);
    return changes.get(key) ?? keys?.has(key) ?? null;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) clear();
    };
  },
  record(item: ItemReference, saved: boolean, version: number): boolean {
    // Ignore an old account's write if authentication changed while it was in flight.
    if (version !== generation) return false;
    changes.set(keyOf(item), saved);
    notify();
    return true;
  },
  reset() {
    clear();
    notify();
    if (listeners.size > 0) void load();
  },
};
