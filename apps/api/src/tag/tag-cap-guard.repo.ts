import type { Tag } from "@post-anki/shared";
import { isUnderTaxonomyCap, normalizeTagName } from "@post-anki/core";
import { withNamedLock } from "../shared/merge-lock.js";
import { listTags, resolveOrCreateTag } from "./tag.repo.js";
import { matchClosestTag } from "./match-closest-tag.js";

const TAG_TAXONOMY_CAP_LOCK_KEY = "tag_taxonomy_cap";

export type MatchClosestTagFn = typeof matchClosestTag;

/**
 * The single write path for auto-tag assignment once a candidate name and an
 * (untrusted) LLM-suggested `matchedName` are known — re-reads the tag list
 * fresh under a whole-table advisory lock (`withNamedLock`) so a concurrent
 * call at cap-1 can never both pass the under-cap check, and never trusts
 * `matchedName` unless it's a real member of that fresh list, closing the
 * gap a stale/hallucinated LLM answer would otherwise open (SCENARIO 4/5,
 * prose-knowledge-fisher--tag-taxonomy-cap). At cap with no valid pre-supplied
 * match (a hallucinated/stale name, or the snapshot-vs-fresh-count race), a
 * second, forced classification call picks the real nearest tag from the
 * fresh list — array order (`freshTags[0]`) is only ever a last-resort
 * fallback if that forced call itself fails to return a real member, or
 * itself throws (prose-knowledge-fisher--tag-cap-guard-cleanup).
 */
export async function resolveTagUnderCapGuard(
  candidateName: string,
  matchedName: string | null,
  matcher: MatchClosestTagFn = matchClosestTag,
): Promise<Tag> {
  return withNamedLock(TAG_TAXONOMY_CAP_LOCK_KEY, async (tx) => {
    const trimmedCandidate = candidateName.trim();
    const normalizedCandidate = normalizeTagName(trimmedCandidate);
    const freshTags = await listTags(tx);

    const exactMatch = freshTags.find((tag) => tag.normalizedName === normalizedCandidate);

    if (exactMatch) {
      return exactMatch;
    }

    const findRealMatch = (name: string | null) => {
      if (!name) {
        return undefined;
      }

      const normalizedMatch = normalizeTagName(name.trim());

      return freshTags.find((tag) => tag.normalizedName === normalizedMatch);
    };

    const realMatch = findRealMatch(matchedName);

    if (realMatch) {
      return realMatch;
    }

    if (isUnderTaxonomyCap(freshTags.length)) {
      return resolveOrCreateTag(trimmedCandidate, tx);
    }

    if (freshTags.length === 0) {
      return resolveOrCreateTag(trimmedCandidate, tx);
    }

    try {
      const forced = await matcher(
        trimmedCandidate,
        undefined,
        freshTags.map((tag) => tag.name),
        true,
      );

      return findRealMatch(forced.matchedTagName) ?? freshTags[0]!;
    } catch {
      // The forced call itself failing (LLM error/timeout/malformed output)
      // is exactly the "forced call failed to return a real member" case —
      // fall through to the same last-resort rather than letting the throw
      // escape the guard entirely.
      return freshTags[0]!;
    }
  });
}
