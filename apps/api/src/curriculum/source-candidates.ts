import { dedupeSourceCandidates } from "@post-anki/core";
import type { SourceKind } from "@post-anki/shared";
import { gatherDocSiteCandidates } from "./doc-link-grounding.js";
import { gatherTrustedSourceCandidates, resolveOfficialDocsUrl } from "./tech-research-grounding.js";
import type { ResolveEffectiveModelTierScope } from "../mastra/tier-resolver.js";
import { log } from "../shared/log.js";

export interface GatheredSourceCandidate {
  url: string;
  title: string;
  discoveryTier: string;
  kind: SourceKind;
  fetchedText: string | null;
}

export interface GatherSourceCandidatesInput {
  name: string;
  docUrl?: string | null;
}

/**
 * Assembles every candidate source for a research-triggered curriculum
 * before anything is generated: the docs-site chain (llms.txt-first, then a
 * bounded crawl — resolving an entry point from a bare name first when no
 * docUrl was given) unioned with the general trusted-source search, which
 * always runs regardless of whether a docs entry point was found. Dedupe by
 * URL, first-tier-found wins.
 */
export async function gatherSourceCandidates(
  input: GatherSourceCandidatesInput,
  scope: ResolveEffectiveModelTierScope = {},
): Promise<GatheredSourceCandidate[]> {
  const [docCandidates, searchCandidates] = await Promise.all([
    resolveDocCandidates(input, scope),
    gatherTrustedSourceCandidates(input.name, scope).catch((err) => {
      log.warn({ err, name: input.name }, "trusted_source_candidates_dispatch_failed");
      return [];
    }),
  ]);

  const combined: GatheredSourceCandidate[] = [
    ...docCandidates,
    ...searchCandidates.map((c) => ({
      url: c.url,
      title: c.title,
      discoveryTier: c.discoveryTier,
      kind: "link" as const,
      fetchedText: null,
    })),
  ];

  return dedupeSourceCandidates(combined);
}

async function resolveDocCandidates(
  input: GatherSourceCandidatesInput,
  scope: ResolveEffectiveModelTierScope,
): Promise<GatheredSourceCandidate[]> {
  if (input.docUrl) {
    return gatherDocSiteCandidates(input.docUrl);
  }

  const resolvedUrl = await resolveOfficialDocsUrl(input.name, scope).catch((err) => {
    log.warn({ err, name: input.name }, "resolve_official_docs_url_dispatch_failed");
    return null;
  });

  if (!resolvedUrl) {
    log.info({ name: input.name }, "source_candidates_no_docs_url_resolved");
    return [];
  }

  return gatherDocSiteCandidates(resolvedUrl);
}
