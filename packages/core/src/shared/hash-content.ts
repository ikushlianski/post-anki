// A cache-invalidation fingerprint, not a security control — deliberately
// not node:crypto, since this package's root barrel is also browser-bundled.
function fnv1a32(text: string, seed: number): number {
  let hash = seed;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// 16 hex chars (two independent 32-bit FNV-1a passes) of the given text.
export function hashContent(text: string): string {
  const a = fnv1a32(text, 0x811c9dc5);
  const b = fnv1a32(text, 0x9e3779b9);

  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
