export interface ListTruncation {
  shown: number;
  total: number;
}

export function listTruncation(list: {
  items: readonly unknown[];
  hasMore?: boolean | undefined;
  total?: number | undefined;
}): ListTruncation | null {
  return list.hasMore && list.total !== undefined ? { shown: list.items.length, total: list.total } : null;
}

export function truncationAfterRemoval(truncation: ListTruncation | null, removed: number): ListTruncation | null {
  if (!truncation) {
    return null;
  }

  const next = { shown: truncation.shown - removed, total: truncation.total - removed };

  return next.total > next.shown ? next : null;
}
