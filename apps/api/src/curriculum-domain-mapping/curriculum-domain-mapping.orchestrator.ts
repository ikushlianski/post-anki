import type { CurriculumDomainNodeMapping, DomainNode } from "@post-anki/shared";
import { domainTaxonomyMappingAgentResultSchema } from "@post-anki/shared";
import { partitionMappingResult, resolveDomainNodeSource } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { getCurriculum, getModuleProgressSnapshots } from "../curriculum/curriculum.repo.js";
import {
  insertDomainTopicSuggestion,
  listDomainNodesForSubject,
} from "../domain-map/domain-map.repo.js";
import { insertSuggestedMappings } from "./curriculum-domain-mapping.repo.js";

const SOURCE = "curriculum-domain-mapping";

function buildTreeLines(nodes: DomainNode[]): string {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  function pathFor(node: DomainNode): string {
    const segments: string[] = [node.name];
    let current = node;

    while (current.parentId) {
      const parent = byId.get(current.parentId);

      if (!parent) {
        break;
      }

      segments.unshift(parent.name);
      current = parent;
    }

    return segments.join(" > ");
  }

  return nodes.map((node) => `- id: ${node.id} — ${pathFor(node)}`).join("\n");
}

function buildMappingPrompt(
  nodes: DomainNode[],
  curriculumName: string,
  topicTitles: string[],
): string {
  return [
    "Subject's taxonomy tree:",
    buildTreeLines(nodes),
    "",
    `Curriculum: "${curriculumName}"`,
    "Module/topic titles:",
    topicTitles.map((title) => `- ${title}`).join("\n"),
  ].join("\n");
}

export type TriggerCurriculumDomainMappingError =
  | "curriculum_not_found"
  | "subject_has_no_static_taxonomy";

// SCENARIOS 1, 6, 7, 11. Loads the curriculum's modules/topics and the
// subject's domain nodes, guards on the subject actually being
// taxonomy-backed (400 otherwise — checked BEFORE any agent call, so a
// curriculum under a non-taxonomy subject never spends a single LLM call),
// calls the domainTaxonomyMapping agent EXACTLY ONCE (never a per-topic
// fan-out — same cost discipline as domain-priority-review.orchestrator.ts),
// partitions the result via the pure partitionMappingResult() deriver
// (drops any hallucinated node id — never calls insertDomainNode anywhere in
// this file), inserts one suggested mapping row per validated match, and
// files any unmatched topic as a domain_topic_suggestion via the existing,
// unmodified review flow (SCENARIO 7 — a node is only ever created through
// that already-reviewed path). Deliberately does NOT mirror
// domain-placement.orchestrator.ts's silent agent-failure fallback: this is
// an explicit, foreground, user-waited-on trigger, so an agent failure
// (network, timeout, schema-invalid structured output) propagates as a
// thrown error — the controller turns that into a 502, and nothing is
// inserted (SCENARIO 11).
export async function triggerCurriculumDomainMapping(
  curriculumId: string,
): Promise<CurriculumDomainNodeMapping[] | { error: TriggerCurriculumDomainMappingError }> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    return { error: "curriculum_not_found" as const };
  }

  const nodes = await listDomainNodesForSubject(curriculum.subjectId);
  const sourceKind = resolveDomainNodeSource(nodes.map((node) => ({ source: node.source })));

  if (sourceKind !== "static_taxonomy") {
    return { error: "subject_has_no_static_taxonomy" as const };
  }

  const modules = await getModuleProgressSnapshots(curriculumId);
  const topicTitles = modules.flatMap((module) => module.topics.map((topic) => topic.title));

  const agent = getMastra().getAgent(AGENT_KEYS.domainTaxonomyMapping);
  const prompt = buildMappingPrompt(nodes, curriculum.name, topicTitles);

  const result = await agent.generate(prompt, {
    structuredOutput: { schema: domainTaxonomyMappingAgentResultSchema },
    requestContext: new RequestContext([["curriculumId", curriculumId]]),
  });

  if (!result.object) {
    throw new Error("domain-taxonomy-mapping agent returned no structured output");
  }

  const parsed = domainTaxonomyMappingAgentResultSchema.parse(result.object);
  const existingNodeIds = new Set(nodes.map((node) => node.id));
  const partitioned = partitionMappingResult(parsed, existingNodeIds);

  const inserted = await insertSuggestedMappings(
    curriculumId,
    partitioned.matched.map((match) => ({ nodeId: match.nodeId, depth: match.depth })),
  );

  for (const topicTitle of partitioned.unmatchedTopics) {
    await insertDomainTopicSuggestion({
      subjectId: curriculum.subjectId,
      proposedParentNodeId: null,
      proposedNodeName: topicTitle,
      reason: `Surfaced while mapping curriculum "${curriculum.name}" to the domain taxonomy — no existing node fit this topic.`,
      source: SOURCE,
    });
  }

  return inserted;
}
