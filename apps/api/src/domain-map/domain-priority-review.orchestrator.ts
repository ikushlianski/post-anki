import type { DepthLevel, DomainNodeTreeItem, DomainPrioritySuggestion } from "@post-anki/shared";
import { domainPriorityReviewAgentResultSchema } from "@post-anki/shared";
import { RequestContext } from "@mastra/core/request-context";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { getDomainMapForSubject, insertPrioritySuggestion } from "./domain-map.repo.js";
import { resolveNodePathByName, type NamedNode } from "./domain-node-name-resolver.js";

const MAX_SUGGESTIONS = 5;
const SOURCE = "general-knowledge";

interface FlatNode extends NamedNode {
  path: string[];
  targetDepth: DepthLevel | null;
  percent: number;
}

function flattenTree(nodes: DomainNodeTreeItem[], parentPath: string[] = []): FlatNode[] {
  return nodes.flatMap((node) => {
    const path = [...parentPath, node.name];
    const flat: FlatNode = {
      id: node.id,
      parentId: node.parentId,
      name: node.name,
      path,
      targetDepth: node.targetDepth,
      percent: node.percent,
    };

    return [flat, ...flattenTree(node.children, path)];
  });
}

function buildPrompt(flatNodes: FlatNode[]): string {
  const lines = flatNodes.map(
    (node) =>
      `- ${node.path.join(" > ")} — target depth: ${node.targetDepth ?? "unset"}, current knowledge: ${node.percent}%`,
  );

  return [
    "Current domain tree for this subject:",
    lines.length > 0 ? lines.join("\n") : "(no nodes)",
  ].join("\n");
}

// Review mechanism (spec.md "Review mechanism (decided)"): loads the tree
// via the existing, unmodified getDomainMapForSubject(), builds ONE prompt
// for the whole tree, calls the domainPriorityReview agent EXACTLY ONCE
// (never a per-node fan-out — cost discipline, Decisions #8), resolves each
// returned nodePath via the shared domain-node-name-resolver.ts, and inserts
// one domain_priority_suggestions row per resolved suggestion. A suggestion
// whose path doesn't resolve to a real node is dropped silently, never
// inserted — same "don't hallucinate a node" posture as the placement
// orchestrator.
//
// Deliberately does NOT mirror domain-placement.orchestrator.ts's silent
// agent-failure fallback (Decisions #10): this trigger is an explicit,
// foreground, user-waited-on action. Any agent failure — network, timeout,
// or a schema-invalid structured response — propagates as a thrown error;
// the controller turns that into a 502 with a clear message. SCENARIO 8.
export async function triggerDomainPriorityReview(
  subjectId: string,
): Promise<DomainPrioritySuggestion[]> {
  const tree = await getDomainMapForSubject(subjectId);
  const flatNodes = flattenTree(tree);
  const prompt = buildPrompt(flatNodes);

  const agent = getMastra().getAgent(AGENT_KEYS.domainPriorityReview);
  const result = await agent.generate(prompt, {
    structuredOutput: { schema: domainPriorityReviewAgentResultSchema },
    requestContext: new RequestContext([["subjectId", subjectId]]),
  });

  if (!result.object) {
    throw new Error("domain-priority-review agent returned no structured output");
  }

  const parsed = domainPriorityReviewAgentResultSchema.parse(result.object);

  const inserted: DomainPrioritySuggestion[] = [];

  for (const suggestion of parsed.suggestions.slice(0, MAX_SUGGESTIONS)) {
    const resolved = resolveNodePathByName(flatNodes, suggestion.nodePath);

    if (!resolved.fullyResolved || !resolved.nodeId) {
      continue;
    }

    const targetNode = flatNodes.find((node) => node.id === resolved.nodeId);

    if (!targetNode) {
      continue;
    }

    const row = await insertPrioritySuggestion({
      domainNodeId: targetNode.id,
      subjectId,
      currentTargetDepth: targetNode.targetDepth,
      suggestedTargetDepth: suggestion.suggestedTargetDepth,
      reason: suggestion.reason,
      source: SOURCE,
    });

    inserted.push(row);
  }

  return inserted;
}
