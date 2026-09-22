export function isPaTagged(tags: string[]): boolean {
  return tags.some((tag) => tag.toUpperCase() === "PA");
}
