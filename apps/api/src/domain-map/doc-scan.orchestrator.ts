import type { DomainNodeTreeItem, DomainSupersessionSuggestion, DomainTopicSuggestion } from "@post-anki/shared";
import { docScanAgentResultSchema } from "@post-anki/shared";
import { AGENT_KEYS, getMastra } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { TRACKED_TOOLS, type TrackedTool } from "./tracked-tools.js";
import { fetchTrackedTool } from "./tracked-tool-fetcher.js";
import {
  getDomainMapForSubject,
  getTrackedToolScanState,
  insertDomainSupersessionSuggestion,
  insertDomainTopicSuggestion,
  listSubjectIdsWithDomainNodes,
  upsertTrackedToolScanState,
} from "./domain-map.repo.js";
import { resolveNodePathByName, type NamedNode } from "./domain-node-name-resolver.js";
import { withDocScanLock } from "./doc-scan-lock.js";

const SOURCE = "doc-scan";
// Post-resolution insert cap (spec.md's step 5b) — the single enforced
// "never more than 5 new rows per scan run" number, distinct from the
// schema-level raw cap (max 3 + max 3 = 6) the agent's own structured
// output is bounded to.
const MAX_TOTAL_SUGGESTIONS = 5;

export interface DocScanResult {
  newTopicSuggestions: DomainTopicSuggestion[];
  supersessionSuggestions: DomainSupersessionSuggestion[];
  toolsScanned: string[];
  toolsChanged: string[];
  agentCalled: boolean;
  agentError?: boolean;
}

function emptyResult(toolsScanned: string[]): DocScanResult {
  return {
    newTopicSuggestions: [],
    supersessionSuggestions: [],
    toolsScanned,
    toolsChanged: [],
    agentCalled: false,
  };
}

interface FlatNode extends NamedNode {
  path: string[];
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
      percent: node.percent,
    };

    return [flat, ...flattenTree(node.children, path)];
  });
}

interface ChangedTool {
  tool: TrackedTool;
  content: string;
  hash: string;
}

function buildPrompt(flatNodes: FlatNode[], changedTools: ChangedTool[]): string {
  const treeLines = flatNodes.map(
    (node) => `- ${node.path.join(" > ")} — current knowledge: ${node.percent}%`,
  );

  const toolSections = changedTools.map(
    (entry) => `## ${entry.tool.label}\n${entry.content}`,
  );

  return [
    "Current domain tree for this subject:",
    treeLines.length > 0 ? treeLines.join("\n") : "(no nodes)",
    "",
    "Changed tracked-tool content since the last scan:",
    toolSections.join("\n\n"),
  ].join("\n");
}

// doc-changelog-scan (issue #49) — the scan mechanism (spec.md "Scan
// mechanism (decided)"). Steps: fetch+hash every tracked tool, compare
// against the persisted watermark, skip entirely (zero agent calls) if
// nothing changed (SCENARIO 3 — the "never a firehose" proof), otherwise
// build ONE prompt from only the changed tools' content and call the
// docScan agent EXACTLY ONCE. Resolve returned paths, cap at
// MAX_TOTAL_SUGGESTIONS, insert.
//
// Failure handling is the OPPOSITE posture from
// domain-priority-review.orchestrator.ts, for the opposite reason (spec.md's
// Decisions #8): this is a scheduled, unwatched background job, so an agent
// failure is caught, logged, and returns an empty/flagged result rather than
// throwing — matching domain-placement.orchestrator.ts's silent-fallback
// posture. Critically, the changed tools' watermark is left UN-advanced on
// failure (SCENARIO 10) so they're retried next run, never silently marked
// "scanned" despite producing nothing.
export async function runDocScan(subjectId: string): Promise<DocScanResult> {
  const toolsScanned: string[] = [];
  const fetchedTools: ChangedTool[] = [];

  for (const tool of TRACKED_TOOLS) {
    const fetched = await fetchTrackedTool(tool);

    if (!fetched) {
      log.warn({ subjectId, toolKey: tool.toolKey }, "doc_scan_tool_fetch_failed");
      continue;
    }

    toolsScanned.push(tool.toolKey);
    fetchedTools.push({ tool, content: fetched.content, hash: fetched.hash });
  }

  if (fetchedTools.length === 0) {
    return emptyResult(toolsScanned);
  }

  return withDocScanLock(
    () => scanFetchedTools(subjectId, toolsScanned, fetchedTools),
    () => {
      // A manual "Scan now" firing while the weekly scheduler's run is still
      // in flight (or a Cloud Scheduler retry overlapping its own first
      // attempt) would otherwise read the same stale watermark and produce a
      // duplicate set of pending suggestions on the review screen. Reads
      // identically to "nothing changed", which is the same posture every
      // other non-outcome of this job already has.
      log.info({ subjectId }, "doc_scan_skipped_concurrent_run");

      return emptyResult(toolsScanned);
    },
  );
}

// The locked critical section: the watermark read-compare-write, with the
// single agent call and the suggestion inserts between the two halves. The
// network-bound tracked-tool fetches deliberately happen BEFORE this, so the
// advisory lock is never held across them.
async function scanFetchedTools(
  subjectId: string,
  toolsScanned: string[],
  fetchedTools: ChangedTool[],
): Promise<DocScanResult> {
  const changedTools: ChangedTool[] = [];

  for (const fetched of fetchedTools) {
    const existingState = await getTrackedToolScanState(fetched.tool.toolKey);

    if (existingState?.lastContentHash === fetched.hash) {
      continue;
    }

    changedTools.push(fetched);
  }

  if (changedTools.length === 0) {
    return emptyResult(toolsScanned);
  }

  const tree = await getDomainMapForSubject(subjectId);
  const flatNodes = flattenTree(tree);
  const prompt = buildPrompt(flatNodes, changedTools);

  try {
    const agent = getMastra().getAgent(AGENT_KEYS.docScan);
    const result = await agent.generate(prompt, {
      structuredOutput: { schema: docScanAgentResultSchema },
    });

    if (!result.object) {
      throw new Error("doc-scan agent returned no structured output");
    }

    const parsed = docScanAgentResultSchema.parse(result.object);

    const resolvedTopics = parsed.newTopicSuggestions
      .map((suggestion) => ({
        proposedParentNodeId: resolveNodePathByName(flatNodes, suggestion.parentNodePath).nodeId,
        proposedNodeName: suggestion.nodeName,
        reason: suggestion.reason,
      }));

    const resolvedSupersessions = parsed.supersessionSuggestions
      .map((suggestion) => resolveNodePathByName(flatNodes, suggestion.nodePath))
      .map((resolved, index) => ({ resolved, suggestion: parsed.supersessionSuggestions[index]! }))
      .filter(({ resolved }) => resolved.fullyResolved && resolved.nodeId)
      .map(({ resolved, suggestion }) => ({
        domainNodeId: resolved.nodeId!,
        reason: suggestion.reason,
      }));

    const cappedTopics = resolvedTopics.slice(0, MAX_TOTAL_SUGGESTIONS);
    const remainingCap = MAX_TOTAL_SUGGESTIONS - cappedTopics.length;
    const cappedSupersessions = resolvedSupersessions.slice(0, Math.max(0, remainingCap));

    const newTopicSuggestions: DomainTopicSuggestion[] = [];

    for (const topic of cappedTopics) {
      newTopicSuggestions.push(
        await insertDomainTopicSuggestion({
          subjectId,
          proposedParentNodeId: topic.proposedParentNodeId,
          proposedNodeName: topic.proposedNodeName,
          reason: topic.reason,
          source: SOURCE,
        }),
      );
    }

    const supersessionSuggestions: DomainSupersessionSuggestion[] = [];

    for (const supersession of cappedSupersessions) {
      supersessionSuggestions.push(
        await insertDomainSupersessionSuggestion({
          subjectId,
          domainNodeId: supersession.domainNodeId,
          reason: supersession.reason,
          source: SOURCE,
        }),
      );
    }

    for (const changed of changedTools) {
      await upsertTrackedToolScanState(changed.tool.toolKey, changed.hash);
    }

    return {
      newTopicSuggestions,
      supersessionSuggestions,
      toolsScanned,
      toolsChanged: changedTools.map((entry) => entry.tool.toolKey),
      agentCalled: true,
    };
  } catch (err) {
    log.error({ err, subjectId }, "doc_scan_agent_failed");

    return {
      ...emptyResult(toolsScanned),
      toolsChanged: changedTools.map((entry) => entry.tool.toolKey),
      agentError: true,
    };
  }
}

// Cron wrapper (spec.md "Scan mechanism (decided)") — one call to
// runDocScan() per subject with at least one domain_nodes row (same
// subject-gating precedent item 7 established). Per-tool fetch+hash work is
// NOT deduplicated across subjects in v1 — deferred optimization, not
// correctness-relevant at today's "exactly one gated subject" scale.
export async function runDocScanForAllTrackedSubjects(): Promise<Record<string, DocScanResult>> {
  const subjectIds = await listSubjectIdsWithDomainNodes();
  const results: Record<string, DocScanResult> = {};

  for (const subjectId of subjectIds) {
    results[subjectId] = await runDocScan(subjectId);
  }

  return results;
}
