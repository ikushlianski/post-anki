import type { RefetchSourceResult } from "@post-anki/shared";
import { getSourceForRefetch, writeRefetchResult } from "./content-library.repo.js";
import { refetchLink } from "./refetch-link.js";

export type RefetchSourceError = "not_found" | "not_refetchable";

// SCENARIO 6/7: the only re-fetch entry point in this module. Scope
// boundary — re-fetch applies to `link` sources with a real URL only; a
// `text` source has no URL to re-fetch (the pasted text IS the source) and
// a `video` source's pasted description is the source of truth per the
// intake module's own decision, so both return "not_refetchable" rather
// than silently writing lastFetchedAt for an attempt that never happened.
export async function refetchSource(
  sourceId: string,
): Promise<RefetchSourceResult | { error: RefetchSourceError }> {
  const source = await getSourceForRefetch(sourceId);

  if (!source) {
    return { error: "not_found" };
  }

  if (source.kind !== "link") {
    return { error: "not_refetchable" };
  }

  const { outcome, text } = await refetchLink(source.value);
  const fetchedAt = new Date();

  await writeRefetchResult(sourceId, {
    outcome,
    fetchedAt,
    fetchedText: outcome === "ok" ? text : null,
  });

  return {
    sourceId,
    outcome,
    lastFetchedAt: fetchedAt.toISOString(),
    fetchedTextUpdated: outcome === "ok",
  };
}
