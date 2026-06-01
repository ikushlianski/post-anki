export function nextOrder(existing: number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export function assignOrders(
  orderedIds: string[],
): Array<{ id: string; order: number }> {
  return orderedIds.map((id, index) => ({ id, order: index + 1 }));
}
