export function chunkButtons<T>(items: T[], perRow: number): T[][] {
  if (perRow < 1) {
    return items.length > 0 ? [items.slice()] : [];
  }

  const rows: T[][] = [];

  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }

  return rows;
}
