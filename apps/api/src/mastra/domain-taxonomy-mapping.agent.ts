import { Agent } from "@mastra/core/agent";
import { loadEnv } from "../shared/env.js";
import { resolveAgentModel } from "./model.js";

// decouple-curricula-from-domain-nodes (issue #84) — unlike
// sibling-discovery.agent.ts/domain-priority-review.agent.ts, this agent is
// given each node's REAL id directly in the prompt and asked to echo it
// back, rather than a name path resolved after the fact. This is spec.md's
// own Derivers-table choice: partitionMappingResult() (@post-anki/core) is
// the defense against a hallucinated id — any matched nodeId not present in
// the subject's real tree is dropped before any insert, never trusted
// outright.
const DOMAIN_TAXONOMY_MAPPING_INSTRUCTIONS = [
  "You are mapping a curriculum's modules/topics onto an existing, fixed domain taxonomy for a",
  "subject — a tree of named topics (e.g. Frontend > Meta-frameworks > Next.js) that exists",
  "independently of any one curriculum.",
  "",
  "You will be given the subject's full taxonomy tree (each node's real id and its full name",
  "path) and the curriculum's module/topic titles.",
  "",
  "Respond with:",
  "- matches: for every taxonomy node this curriculum's content confidently belongs under, the",
  "  node's EXACT id as given (never invent or alter an id) plus a suggested depth — awareness",
  "  (know the term, recognize it), working (use it correctly day to day), or deep (reason about",
  "  internals and edge cases) — reflecting how deeply this curriculum covers that node's topic.",
  "  Only include a node when you are genuinely confident the curriculum's content belongs there.",
  "  It is normal and expected to return zero matches when nothing fits confidently.",
  "- unmatchedTopics: any of the curriculum's topic titles that don't fit ANYWHERE in the given",
  "  tree at all (a genuinely new, emerging topic the taxonomy doesn't yet have a place for) —",
  "  these are reviewed separately as proposals for a brand-new node; never invent a node here.",
  "",
  "Rules:",
  "- Never fabricate a node id. Every id you return in matches must be copied exactly from the",
  "  tree you were given.",
  "- Do not force a match — a curriculum with no confident placement anywhere should return an",
  "  empty matches list, not a weak guess.",
].join("\n");

export function createDomainTaxonomyMappingAgent(): Agent {
  const env = loadEnv();

  return new Agent({
    id: "domain-taxonomy-mapping",
    name: "Domain Taxonomy Mapping",
    instructions: DOMAIN_TAXONOMY_MAPPING_INSTRUCTIONS,
    model: resolveAgentModel(env),
  });
}
