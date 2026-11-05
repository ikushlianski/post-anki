export function interleaveNewWithSeen<T>(seen: T[], fresh: T[], limit: number): T[] {
  const mixed: T[] = [];
  let s = 0;
  let f = 0;

  while (mixed.length < limit && (s < seen.length || f < fresh.length)) {
    if (s < seen.length) {
      mixed.push(seen[s++]!);
    }

    if (mixed.length < limit && f < fresh.length) {
      mixed.push(fresh[f++]!);
    }
  }

  return mixed;
}
