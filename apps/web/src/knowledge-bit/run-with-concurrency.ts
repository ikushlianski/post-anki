export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;

  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next;

      next += 1;
      results[index] = await worker(items[index] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, lane),
  );

  return results;
}
