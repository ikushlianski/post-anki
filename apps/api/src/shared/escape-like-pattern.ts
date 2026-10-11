export function escapeLikePattern(query: string): string {
  return query.replace(/[\\%_]/g, "\\$&");
}
