import { createHash } from "node:crypto";

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

// Short hash (first 16 hex chars of SHA-256) of a subject's current
// name+description — compared against the cached embedding_hash column to
// decide whether a subject needs re-embedding (SCENARIO 2, 3).
export function hashSubjectContent(
  name: string,
  description: string | undefined,
): string {
  const text = buildSubjectContentText(name, description);

  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}
