export type UpdateLru = {
  capacity: number;
  seen: Set<number>;
  order: number[];
};

export function createUpdateLru(capacity = 256): UpdateLru {
  return { capacity, seen: new Set(), order: [] };
}

export function isDuplicateUpdate(updateId: number, lru: UpdateLru): boolean {
  if (lru.seen.has(updateId)) return true;

  lru.seen.add(updateId);
  lru.order.push(updateId);

  while (lru.order.length > lru.capacity) {
    const oldest = lru.order.shift();
    if (oldest !== undefined) lru.seen.delete(oldest);
  }

  return false;
}
