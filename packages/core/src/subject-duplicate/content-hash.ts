import { hashContent } from "../shared/hash-content.js";

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

// A subject's current name+description, hashed via the shared fingerprint.
export function hashSubjectContent(
  name: string,
  description: string | undefined,
): string {
  return hashContent(buildSubjectContentText(name, description));
}
