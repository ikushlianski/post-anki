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

export const domainPriorityReviewAgentResultSchema = z.object({
  suggestions: z.array(domainPrioritySuggestionAgentItemSchema).max(5),
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

// Re-exported for callers that only need the module-progress shape this
// deriver reuses unmodified.
export { moduleProgressSchema };
