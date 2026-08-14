import { z } from "zod";
import { moduleProgressSchema } from "./progress";
import { depthLevelSchema } from "./depth";

export const domainNodeSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string(),
  // The node's target depth (domain-priority-review, issue #52) — nullable,
  // no default: "unset" is a real, representable state, distinct from any
  // depth level. Independent of the node's real rollup percentage
  // (domainNodeProgress(), unchanged).
  targetDepth: depthLevelSchema.nullable(),
  // doc-changelog-scan (issue #49) — a flag, never a percent change
  // (spec.md's Decisions #2). Written only by
  // resolveDomainSupersessionSuggestion() on { status: "accepted" }; null
  // means not flagged. supersededReason snapshots the accepted suggestion's
  // reason text at accept time.
  supersededAt: z.string().nullable(),
  supersededReason: z.string().nullable(),
  // decouple-curricula-from-domain-nodes (issue #84) — "static_taxonomy" for
  // a node seeded once via seed-domain-taxonomy.ts, independent of any
  // curriculum; "ai_generated" (the default) for every node created
  // dynamically by resolveDomainPlacement's sibling-discovery path, exactly
  // as every existing row already is. See resolveDomainNodeSource()
  // (@post-anki/core) for how this decides which placement path a subject
  // uses.
  source: z.enum(["static_taxonomy", "ai_generated"]),
});

export type DomainNode = z.infer<typeof domainNodeSchema>;

export const domainNodeCurriculumSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type DomainNodeCurriculumSummary = z.infer<typeof domainNodeCurriculumSummarySchema>;

// Recursive tree item returned by GET /subjects/:id/domain-map. `percent`
// carries the domainNodeProgress() rollup for this node's whole subtree
// (packages/core/src/domain-map/domain-map-progress.ts) — present on EVERY
// node, including ones with no curriculum anywhere in their subtree, which
// is what makes "absent from the tree" impossible for an untouched node.
export interface DomainNodeTreeItem {
  id: string;
  subjectId: string;
  parentId: string | null;
  name: string;
  description: string | null;
  order: number;
  percent: number;
  // domain-priority-review (issue #52) additions — both derived/stored
  // independently of `percent`. `targetDepth` is the node's stored target
  // (nullable, no default); `priorityDistance` is
  // domainPriorityDistance(targetDepth, percent), null when no target is
  // set (never 0, which would misleadingly read as "on track").
  targetDepth: import("./depth").DepthLevel | null;
  priorityDistance: number | null;
  curricula: DomainNodeCurriculumSummary[];
  children: DomainNodeTreeItem[];
  // doc-changelog-scan (issue #49) — see domainNodeSchema's own comment.
  // Rendered beside `percent`, never derived from or affecting it.
  supersededAt: string | null;
  supersededReason: string | null;
  // decouple-curricula-from-domain-nodes (issue #84) — carried through so the
  // frontend can decide whether to render the "Map to taxonomy" trigger
  // (curriculum-domain-mapping-panel.tsx) for a curriculum's own subject,
  // without a second request — a subject is taxonomy-backed iff ANY node in
  // its tree carries "static_taxonomy" here.
  source: "static_taxonomy" | "ai_generated";
  // deepen-widen-recommendations (issue #90) — projected read-only from
  // `domain_nodes.kind` (learning-list-intake), same "carried through so a
  // consumer doesn't need a second request" rationale as `source` above.
  // `computeDeepenCandidates`/`computeWidenCandidates` (@post-anki/core)
  // exclude any node with `kind === "area"` on either side of a candidate
  // pair — Areas are a fixed, purpose-built structure layered on top of the
  // taxonomy, not part of the 208-node/15-domain hierarchy those functions
  // reason over.
  kind: "sub_subject" | "area" | null;
}

export const domainNodeTreeItemSchema: z.ZodType<DomainNodeTreeItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    subjectId: z.string(),
    parentId: z.string().nullable(),
    name: z.string(),
    description: z.string().nullable(),
    order: z.number().int(),
    percent: z.number().int(),
    targetDepth: depthLevelSchema.nullable(),
    priorityDistance: z.number().nullable(),
    curricula: z.array(domainNodeCurriculumSummarySchema),
    children: z.array(domainNodeTreeItemSchema),
    supersededAt: z.string().nullable(),
    supersededReason: z.string().nullable(),
    source: z.enum(["static_taxonomy", "ai_generated"]),
    kind: z.enum(["sub_subject", "area"]).nullable(),
  }),
);

export const domainMapResponseSchema = z.array(domainNodeTreeItemSchema);

export type DomainMapResponse = z.infer<typeof domainMapResponseSchema>;

// The sibling-discovery agent's structured-output contract (SCENARIO 5).
// Returns NAMES, not database ids — the orchestrator resolves parentNodePath
// against real nodes by case-insensitive name match, never asking the agent
// to invent or echo an opaque id (matches how curriculumArchitect returns
// module/topic titles, never database keys).
export const siblingDiscoveryResultSchema = z.object({
  parentNodePath: z.array(z.string()).nullable(),
  nodeName: z.string().min(1),
  siblingSuggestions: z.array(z.string()).max(8),
});

export type SiblingDiscoveryResult = z.infer<typeof siblingDiscoveryResultSchema>;

// domain-priority-review (issue #52) — the review mechanism's own contracts.

// PATCH /domain-nodes/:id — sets or clears a node's target depth directly,
// independent of the review flow.
export const updateDomainNodeInput = z.object({
  targetDepth: depthLevelSchema.nullable(),
});

export type UpdateDomainNodeInput = z.infer<typeof updateDomainNodeInput>;

export const domainPrioritySuggestionStatusSchema = z.enum(["pending", "accepted", "rejected"]);

export type DomainPrioritySuggestionStatus = z.infer<typeof domainPrioritySuggestionStatusSchema>;

// One row per suggestion a review run produces (domain_priority_suggestions).
// `source` is the seam #49 (doc-scan) and #53 (job-market-scan) plug their
// own suggestion producers into later, without a schema change — this pass
// only ever writes "general-knowledge".
export const domainPrioritySuggestionSchema = z.object({
  id: z.string(),
  domainNodeId: z.string(),
  subjectId: z.string(),
  currentTargetDepth: depthLevelSchema.nullable(),
  suggestedTargetDepth: depthLevelSchema,
  reason: z.string().min(1),
  source: z.string().min(1),
  status: domainPrioritySuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type DomainPrioritySuggestion = z.infer<typeof domainPrioritySuggestionSchema>;

export const triggerDomainPriorityReviewResultSchema = z.array(domainPrioritySuggestionSchema);

export type TriggerDomainPriorityReviewResult = z.infer<
  typeof triggerDomainPriorityReviewResultSchema
>;

// PATCH /domain-priority-suggestions/:id
export const resolveDomainPrioritySuggestionInput = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type ResolveDomainPrioritySuggestionInput = z.infer<
  typeof resolveDomainPrioritySuggestionInput
>;

// The domainPriorityReview agent's own structured-output contract — names,
// never ids (same posture as siblingDiscoveryResultSchema above): the
// orchestrator resolves each nodePath against real nodes via
// domain-node-name-resolver.ts. Capped at 5 suggestions per review
// (cost discipline — one call, whole tree, never a per-node fan-out).
export const domainPrioritySuggestionAgentItemSchema = z.object({
  nodePath: z.array(z.string()).min(1),
  suggestedTargetDepth: depthLevelSchema,
  reason: z.string().min(1),
});

// .min(1) is a real contract, not defensive padding: the agent's instructions
// already say "never return an empty list", so a schema-valid empty array is a
// malformed response and must take the same 502 path as any other one —
// otherwise it reads to the user as "the review reminder silently did nothing".
export const domainPriorityReviewAgentResultSchema = z.object({
  suggestions: z.array(domainPrioritySuggestionAgentItemSchema).min(1).max(5),
});

export type DomainPriorityReviewAgentResult = z.infer<
  typeof domainPriorityReviewAgentResultSchema
>;

// GET /subjects/:id/domain-priority-review-status — a lightweight status
// read the priority-review screen uses to render the "review due" banner
// (SCENARIO 9), computed server-side from the same getLastReviewedAt() the
// review trigger itself updates by inserting new rows.
export const domainPriorityReviewStatusSchema = z.object({
  lastReviewedAt: z.string().nullable(),
  due: z.boolean(),
});

export type DomainPriorityReviewStatus = z.infer<typeof domainPriorityReviewStatusSchema>;

// doc-changelog-scan (issue #49) — the scan mechanism's own contracts.
// Two sibling suggestion tables, not a reuse of domain_priority_suggestions
// (spec.md's Decisions #1: neither "propose a brand-new node" nor "flag an
// existing node" fits that row's NOT NULL domain_node_id / suggested_target_
// depth payload shape).

export const domainSuggestionStatusSchema = z.enum(["pending", "accepted", "rejected"]);

export type DomainSuggestionStatus = z.infer<typeof domainSuggestionStatusSchema>;

// One row per "propose a brand-new node" suggestion (domain_topic_
// suggestions). proposedParentNodeId is resolved and stored as a real id at
// suggestion-creation time (spec.md's Decisions #11), never re-resolved by
// name at accept time; null means "attach at the subject root."
export const domainTopicSuggestionSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  proposedParentNodeId: z.string().nullable(),
  proposedNodeName: z.string().min(1),
  reason: z.string().min(1),
  source: z.string().min(1),
  status: domainSuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  createdDomainNodeId: z.string().nullable(),
});

export type DomainTopicSuggestion = z.infer<typeof domainTopicSuggestionSchema>;

// One row per "flag an existing node as possibly superseded" suggestion
// (domain_supersession_suggestions).
export const domainSupersessionSuggestionSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  domainNodeId: z.string(),
  reason: z.string().min(1),
  source: z.string().min(1),
  status: domainSuggestionStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type DomainSupersessionSuggestion = z.infer<typeof domainSupersessionSuggestionSchema>;

// POST /subjects/:id/doc-scans and POST /doc-scans both return this shape.
// agentCalled: false covers BOTH the "nothing changed, zero-call firehose
// proof" path (SCENARIO 3) AND the "agent call failed, watermark left
// un-advanced" path (SCENARIO 10) — agentError distinguishes the latter.
export const docScanResultSchema = z.object({
  newTopicSuggestions: z.array(domainTopicSuggestionSchema),
  supersessionSuggestions: z.array(domainSupersessionSuggestionSchema),
  toolsScanned: z.array(z.string()),
  toolsChanged: z.array(z.string()),
  agentCalled: z.boolean(),
  agentError: z.boolean().optional(),
});

export type DocScanResult = z.infer<typeof docScanResultSchema>;

// The docScan agent's own structured-output contract — names, never ids
// (same posture as siblingDiscoveryResultSchema /
// domainPrioritySuggestionAgentItemSchema above). Schema-level caps (max 3
// each, max 6 combined) bound the raw agent output; MAX_TOTAL_SUGGESTIONS (5)
// is the separate, stricter post-resolution insert cap enforced by the
// orchestrator (spec.md's step 5b), not by this schema.
export const domainTopicSuggestionAgentItemSchema = z.object({
  parentNodePath: z.array(z.string()).nullable(),
  nodeName: z.string().min(1),
  reason: z.string().min(1),
});

export const domainSupersessionSuggestionAgentItemSchema = z.object({
  nodePath: z.array(z.string()).min(1),
  reason: z.string().min(1),
});

export const docScanAgentResultSchema = z.object({
  newTopicSuggestions: z.array(domainTopicSuggestionAgentItemSchema).max(3),
  supersessionSuggestions: z.array(domainSupersessionSuggestionAgentItemSchema).max(3),
});

export type DocScanAgentResult = z.infer<typeof docScanAgentResultSchema>;

// PATCH /domain-topic-suggestions/:id
export const updateDomainTopicSuggestionInput = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type UpdateDomainTopicSuggestionInput = z.infer<typeof updateDomainTopicSuggestionInput>;

// PATCH /domain-supersession-suggestions/:id
export const updateDomainSupersessionSuggestionInput = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type UpdateDomainSupersessionSuggestionInput = z.infer<
  typeof updateDomainSupersessionSuggestionInput
>;

// GET /subjects/:id/doc-scan-suggestions?status=pending
export const docScanSuggestionsResponseSchema = z.object({
  newTopics: z.array(domainTopicSuggestionSchema),
  supersessions: z.array(domainSupersessionSuggestionSchema),
});

export type DocScanSuggestionsResponse = z.infer<typeof docScanSuggestionsResponseSchema>;

// Re-exported for callers that only need the module-progress shape this
// deriver reuses unmodified.
export { moduleProgressSchema };

// domain-node-merge (issue #61) — POST /domain-nodes/:targetId/merge. Absorbs
// sourceDomainNodeId into targetId: every curriculum and every child node
// attached to the source move to the target, the source row is deleted.
// Mirrors mergeSubjectsInput/mergeSubjectsResultSchema's exact shape.
export const mergeDomainNodesInput = z.object({
  sourceDomainNodeId: z.string(),
});

export type MergeDomainNodesInput = z.infer<typeof mergeDomainNodesInput>;

export const mergeDomainNodesResultSchema = z.object({
  targetDomainNodeId: z.string(),
  sourceDomainNodeId: z.string(),
  curriculaMoved: z.number(),
  childNodesMoved: z.number(),
});

export type MergeDomainNodesResult = z.infer<typeof mergeDomainNodesResultSchema>;

// decouple-curricula-from-domain-nodes (issue #84) — the many-to-many
// curriculum <-> domain node placement mechanism. See
// apps/api/src/db/schema.ts's curriculumDomainNodeMappings for the full
// status/source lifecycle this mirrors.

export const curriculumDomainNodeMappingStatusSchema = z.enum([
  "suggested",
  "confirmed",
  "rejected",
]);

export type CurriculumDomainNodeMappingStatus = z.infer<
  typeof curriculumDomainNodeMappingStatusSchema
>;

export const curriculumDomainNodeMappingSourceSchema = z.enum([
  "ai_suggested",
  "manual",
  "auto",
]);

export type CurriculumDomainNodeMappingSource = z.infer<
  typeof curriculumDomainNodeMappingSourceSchema
>;

export const curriculumDomainNodeMappingSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  domainNodeId: z.string(),
  depth: depthLevelSchema.nullable(),
  status: curriculumDomainNodeMappingStatusSchema,
  source: curriculumDomainNodeMappingSourceSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export type CurriculumDomainNodeMapping = z.infer<typeof curriculumDomainNodeMappingSchema>;

// POST /curricula/:id/domain-mappings (trigger) and GET (list) both return
// this shape.
export const curriculumDomainMappingsResponseSchema = z.array(curriculumDomainNodeMappingSchema);

export type CurriculumDomainMappingsResponse = z.infer<
  typeof curriculumDomainMappingsResponseSchema
>;

// PATCH /curriculum-domain-mappings/:id — accept (optionally overriding the
// AI's suggested depth, SCENARIO 4) or reject a suggested mapping.
export const resolveCurriculumDomainMappingInput = z.object({
  status: z.enum(["confirmed", "rejected"]),
  depth: depthLevelSchema.optional(),
});

export type ResolveCurriculumDomainMappingInput = z.infer<
  typeof resolveCurriculumDomainMappingInput
>;

// The domainTaxonomyMapping agent's own structured-output contract.
// Deliberately returns real node IDS, not names (unlike
// siblingDiscoveryResultSchema/domainPrioritySuggestionAgentItemSchema,
// which return names to sidestep hallucination risk by construction) — this
// agent is given the subject's full taxonomy tree WITH each node's real id
// in the prompt, and partitionMappingResult() (@post-anki/core) is the
// defense against a hallucinated id: any matched nodeId not present in the
// subject's real tree is dropped before any insert (spec.md's Derivers
// table; the DoD's own required test case).
export const domainTaxonomyMappingAgentMatchSchema = z.object({
  nodeId: z.string().min(1),
  depth: depthLevelSchema,
});

export const domainTaxonomyMappingAgentResultSchema = z.object({
  matches: z.array(domainTaxonomyMappingAgentMatchSchema),
  unmatchedTopics: z.array(z.string()),
});

export type DomainTaxonomyMappingAgentResult = z.infer<
  typeof domainTaxonomyMappingAgentResultSchema
>;
