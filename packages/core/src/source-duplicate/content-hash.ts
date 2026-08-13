// Sources carry meaningfully more body text than a subject's
// name+description (fetchedText can run up to source-fetch.ts's own
// MAX_CHARS_PER_SOURCE, 20,000 chars) — a truncation bound this much
// smaller than that keeps the embedding call's cost bounded while still
// capturing enough of the article to distinguish it from an unrelated one.
// Untuned starting value, same posture as subject-duplicate's own
// MAX_DESCRIPTION_CHARS — DoD asserts behavior, not this exact number.
export const MAX_SOURCE_CONTENT_CHARS = 4000;

// The exact `title + "\n" + fetchedText` text a source's cached embedding
// was computed from. Exported separately from hashSourceContent so the
// orchestrator can send this same string to the embeddings endpoint — hash
// and embedding must always be computed from identical text.
export function buildSourceContentText(
  title: string | null | undefined,
  fetchedText: string | null | undefined,
): string {
  const truncatedBody = (fetchedText ?? "").slice(0, MAX_SOURCE_CONTENT_CHARS);

  return `${title ?? ""}\n${truncatedBody}`;
}

// Cache-invalidation fingerprint, not a security control — deliberately
// not node:crypto's createHash, since packages/core is imported by both
// apps/api and apps/web, and a Node-only import here breaks every browser
// bundle that pulls in this package's root barrel. Duplicated from
// subject-duplicate/content-hash.ts's identical helper rather than shared,
// per spec.md's explicit "source-scoped versions in a new folder, not by
// editing subject-duplicate" decision — title+fetchedText is meaningfully
// different content than name+description, even though the hashing
// mechanism itself is the same.
function fnv1a32(text: string, seed: number): number {
  let hash = seed;

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

// 16 hex chars (two independent 32-bit FNV-1a passes) of a source's current
// title+fetchedText — compared against the cached embedding_hash column to
// decide whether a source needs re-embedding.
export function hashSourceContent(
  title: string | null | undefined,
  fetchedText: string | null | undefined,
): string {
  const text = buildSourceContentText(title, fetchedText);
  const a = fnv1a32(text, 0x811c9dc5);
  const b = fnv1a32(text, 0x9e3779b9);

  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
