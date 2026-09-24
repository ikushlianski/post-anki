import type { Tag } from "@post-anki/shared";
import { isUnderTaxonomyCap, normalizeTagName } from "@post-anki/core";
import { listTags } from "./tag.repo.js";
import { resolveTagUnderCapGuard } from "./tag-cap-guard.repo.js";
import { matchClosestTag } from "./match-closest-tag.js";

export interface TagAutoAssignDeps {
  listTags: () => Promise<Tag[]>;
  resolveTagUnderCapGuard: (candidateName: string, matchedName: string | null) => Promise<Tag>;
  matchClosestTag: (
    candidateName: string,
    context: string | undefined,
    existingTagNames: string[],
    forceMatch: boolean,
  ) => Promise<{ matchedTagName: string | null }>;
}

export function defaultTagAutoAssignDeps(): TagAutoAssignDeps {
  return { listTags, resolveTagUnderCapGuard, matchClosestTag };
}

/**
 * Reuses an exact-name match with no LLM call; otherwise asks a cheap LLM to
 * pick a close-meaning existing tag, then hands the (untrusted) LLM answer to
 * `resolveTagUnderCapGuard`, which re-reads the tag list fresh under a lock
 * and never trusts a name that isn't a real member — creating a new tag only
 * while the shared taxonomy is under TAG_TAXONOMY_CAP (spec.md, scenarios.md
 * under prose-knowledge-fisher--tag-taxonomy-cap). This first `listTags` call
 * is a best-effort snapshot for the LLM prompt only, not the source of truth
 * for the cap decision — that happens fresh, inside the lock.
 */
export async function assignTagForAutoTag(
  candidateName: string,
  context?: string,
  deps: TagAutoAssignDeps = defaultTagAutoAssignDeps(),
): Promise<Tag> {
  const normalized = normalizeTagName(candidateName);
  const existingTags = await deps.listTags();
  const exactMatch = existingTags.find((tag) => tag.normalizedName === normalized);

  if (exactMatch) {
    return exactMatch;
  }

  const underCap = isUnderTaxonomyCap(existingTags.length);
  const match = await deps.matchClosestTag(
    candidateName,
    context,
    existingTags.map((tag) => tag.name),
    !underCap,
  );

  return deps.resolveTagUnderCapGuard(candidateName, match.matchedTagName);
}
