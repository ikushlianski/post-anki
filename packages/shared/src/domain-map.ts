import { z } from "zod";
import { moduleProgressSchema } from "./progress";

export const domainNodeSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string().nullable(),
  order: z.number().int(),
  createdAt: z.string(),
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

// Re-exported for callers that only need the module-progress shape this
// deriver reuses unmodified.
export { moduleProgressSchema };
