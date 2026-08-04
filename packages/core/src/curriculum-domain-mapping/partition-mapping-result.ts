import type { DepthLevel } from "@post-anki/shared";

export interface MappingAgentMatch {
  nodeId: string;
  depth: DepthLevel;
}

export interface MappingAgentResult {
  matches: MappingAgentMatch[];
  unmatchedTopics: string[];
}

export interface PartitionedMappingResult {
  matched: MappingAgentMatch[];
  unmatchedTopics: string[];
}

// The one guard between the mapping agent's raw structured output and any
// database write: drops any {nodeId, depth} whose nodeId is not a real,
// existing node in the subject's own tree (existingNodeIds), rather than
// ever letting a hallucinated id reach insertSuggestedMappings — same
// defensive posture domain-placement.orchestrator.ts's resolveParentNodePath
// and domain-priority-review.orchestrator.ts's resolveNodePathByName already
// use, just validating an id directly here rather than resolving a name
// path. unmatchedTopics pass through untouched — they become
// domain_topic_suggestions rows via the existing review flow, never a direct
// node insert (SCENARIO 7).
export function partitionMappingResult(
  agentResult: MappingAgentResult,
  existingNodeIds: Set<string>,
): PartitionedMappingResult {
  return {
    matched: agentResult.matches.filter((match) => existingNodeIds.has(match.nodeId)),
    unmatchedTopics: agentResult.unmatchedTopics,
  };
}
