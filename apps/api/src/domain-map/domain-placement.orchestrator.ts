import { normalizeTagName } from "@post-anki/core";
import type { DomainNode } from "@post-anki/shared";
import { siblingDiscoveryResultSchema } from "@post-anki/shared";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { getDomainNode, insertDomainNode, listDomainNodesForSubject } from "./domain-map.repo.js";

const MAX_SIBLING_SUGGESTIONS = 8;

export interface ResolveDomainPlacementInput {
  subjectId: string;
  name: string;
  domainNodeId?: string | null;
}

export interface ResolveDomainPlacementResult {
  domainNodeId: string | null;
}

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

  return nodes.map((node) => `- ${pathFor(node)}`).join("\n");
}

function buildSiblingDiscoveryPrompt(existingNodes: DomainNode[], topicName: string): string {
  return [
    "Existing tree for this subject:",
    buildTreeLines(existingNodes),
    "",
    `New topic name (no existing node matched it): "${topicName}"`,
  ].join("\n");
}

// Resolves a candidate parentNodePath (see sibling-discovery.agent.ts's own
// contract: the first element is a generic root marker, never a real node)
// against real nodes by case-insensitive name match, walking one segment at
// a time and stopping at the first unresolved segment — falls back to its
// last successfully resolved ancestor (or the subject root, null), never to
// a database-id hallucination.
function resolveParentNodePath(
  existingNodes: DomainNode[],
  parentNodePath: string[] | null,
): string | null {
  if (!parentNodePath || parentNodePath.length === 0) {
    return null;
  }

  let currentParentId: string | null = null;
  let sawFirstSegment = false;

  for (const segment of parentNodePath) {
    const normalizedSegment = normalizeTagName(segment);
    const match = existingNodes.find(
      (node) =>
        node.parentId === currentParentId && normalizeTagName(node.name) === normalizedSegment,
    );

    if (!match) {
      // The very first segment is the agent's own generic root label, never
      // a real node — skip it silently rather than treating it as an
      // unresolved segment. Any later unmatched segment is a genuine
      // resolution stop.
      if (!sawFirstSegment) {
        sawFirstSegment = true;
        continue;
      }

      return currentParentId;
    }

    sawFirstSegment = true;
    currentParentId = match.id;
  }

  return currentParentId;
}

// The placement mechanism (spec.md "Placement mechanism (decided)"): three
// paths evaluated in order. Explicit > silent normalized match > the cheap
// sibling-discovery agent — only ever reaching the agent when the first two
// both miss and the subject already has a tree (cost control). Any agent
// failure (network, timeout, schema-invalid structured output) is caught
// and falls back to unplaced, never blocking curriculum creation.
export async function resolveDomainPlacement(
  input: ResolveDomainPlacementInput,
): Promise<ResolveDomainPlacementResult> {
  // Path 1: explicit — zero match query, zero agent call.
  if (input.domainNodeId) {
    const node = await getDomainNode(input.domainNodeId);

    if (node && node.subjectId === input.subjectId) {
      return { domainNodeId: node.id };
    }

    return { domainNodeId: null };
  }

  const existingNodes = await listDomainNodesForSubject(input.subjectId);

  // Subject gating: no tree at all -> skip placement entirely, identical to
  // today's behavior. Cost control — the other 7 non-gated subjects never
  // fire a placement query or agent call.
  if (existingNodes.length === 0) {
    return { domainNodeId: null };
  }

  // Path 2: silent exact/normalized match.
  const normalizedTopic = normalizeTagName(input.name);
  const matched = existingNodes.find(
    (node) => normalizeTagName(node.name) === normalizedTopic,
  );

  if (matched) {
    return { domainNodeId: matched.id };
  }

  // Path 3: the cheap sibling-discovery agent — the one remaining ambiguous
  // case. Exactly one call.
  try {
    const agent = getMastra().getAgent(AGENT_KEYS.siblingDiscovery);
    const prompt = buildSiblingDiscoveryPrompt(existingNodes, input.name);

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: siblingDiscoveryResultSchema },
    });

    if (!result.object) {
      throw new Error("sibling-discovery agent returned no structured output");
    }

    const parsed = siblingDiscoveryResultSchema.parse(result.object);
    const parentId = resolveParentNodePath(existingNodes, parsed.parentNodePath);

    const newNode = await insertDomainNode({
      subjectId: input.subjectId,
      parentId,
      name: parsed.nodeName,
    });

    const existingSiblingNames = new Set(
      existingNodes
        .filter((node) => node.parentId === parentId)
        .map((node) => normalizeTagName(node.name)),
    );
    existingSiblingNames.add(normalizeTagName(newNode.name));

    for (const suggestion of parsed.siblingSuggestions.slice(0, MAX_SIBLING_SUGGESTIONS)) {
      const normalizedSuggestion = normalizeTagName(suggestion);

      if (existingSiblingNames.has(normalizedSuggestion)) {
        continue;
      }

      existingSiblingNames.add(normalizedSuggestion);
      await insertDomainNode({ subjectId: input.subjectId, parentId, name: suggestion });
    }

    return { domainNodeId: newNode.id };
  } catch (err) {
    log.error(
      { err, subjectId: input.subjectId, name: input.name },
      "domain_placement_agent_failed",
    );

    return { domainNodeId: null };
  }
}
