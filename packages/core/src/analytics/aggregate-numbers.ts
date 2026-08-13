export interface NumberAggregate {
  count: number;
  avg: number;
  median: number;
}

export function aggregateNumbers(values: number[]): NumberAggregate | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const avg = sorted.reduce((sum, value) => sum + value, 0) / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  return { count, avg, median };
}

export interface KeyedValue {
  key: string;
  value: number | null;
}

export function groupAndAggregate(
  entries: KeyedValue[],
  keys: string[],
): Map<string, NumberAggregate | null> {
  const byKey = new Map<string, number[]>();

  for (const key of keys) {
    byKey.set(key, []);
  }

  for (const entry of entries) {
    if (entry.value === null) {
      continue;
    }

    const bucket = byKey.get(entry.key);

    if (bucket) {
      bucket.push(entry.value);
    } else {
      byKey.set(entry.key, [entry.value]);
    }
  }

  const result = new Map<string, NumberAggregate | null>();

  for (const [key, values] of byKey) {
    result.set(key, aggregateNumbers(values));
  }

  return result;
}
