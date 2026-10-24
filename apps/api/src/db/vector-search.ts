const MIN_EF_SEARCH = 40;
const MAX_EF_SEARCH = 1000;

export function efSearchFor(topK: number): number {
  return Math.min(MAX_EF_SEARCH, Math.max(MIN_EF_SEARCH, topK));
}
