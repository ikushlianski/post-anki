export function nextOrder(existing: number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export function assignOrders(
  orderedIds: string[],
): Array<{ id: string; order: number }> {
  return orderedIds.map((id, index) => ({ id, order: index + 1 }));
}

export function sortForDisplay<T extends { order: number; priority: number }>(
  items: T[],
  strict: boolean,
): T[] {
  if (strict) {
    return [...items].sort((a, b) => a.order - b.order);
  }

  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    return a.order - b.order;
  });
}

export type Priority = -1 | 0 | 1;

export function nextPriority(
  current: Priority,
  direction: "up" | "down",
): Priority {
  const target: Priority = direction === "up" ? 1 : -1;

  return current === target ? 0 : target;
}
