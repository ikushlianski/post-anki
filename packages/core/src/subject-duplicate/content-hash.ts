// Decision #3 (spec.md): descriptions are truncated to this length before
// both hashing AND embedding — the same truncated text must be what gets
// hashed (for cache-invalidation comparisons) and what gets sent to the
// embeddings endpoint, or a cached hash could match while the embedded text
// silently didn't (or vice versa).
export const MAX_DESCRIPTION_CHARS = 2000;

// The exact `name + "\n" + description` text a subject's cached embedding
// was computed from (architecture.md's "Data model evolution"). Exported
// separately from hashSubjectContent so the orchestrator can send this same
// string to the embeddings endpoint — hash and embedding must always be
// computed from identical text.
export function buildSubjectContentText(
  name: string,
  description: string | undefined,
): string {
  const truncatedDescription = (description ?? "").slice(0, MAX_DESCRIPTION_CHARS);

  return `${name}\n${truncatedDescription}`;
}

// This is a cache-invalidation fingerprint, not a security control, so a
// non-cryptographic hash is fine — deliberately not `node:crypto`'s
// createHash, since packages/core is imported by both apps/api and apps/web,
// and a Node-only import here breaks every browser bundle that pulls in
// this package's root barrel.
function fnv1a32(text: string, seed: number): number {
  let hash = seed;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// 16 hex chars (two independent 32-bit FNV-1a passes) of a subject's current
// name+description — compared against the cached embedding_hash column to
// decide whether a subject needs re-embedding (SCENARIO 2, 3).
export function hashSubjectContent(
  name: string,
  description: string | undefined,
): string {
  const text = buildSubjectContentText(name, description);
  const a = fnv1a32(text, 0x811c9dc5);
  const b = fnv1a32(text, 0x9e3779b9);

  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
