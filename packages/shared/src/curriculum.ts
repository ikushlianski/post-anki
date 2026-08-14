import { z } from "zod";
import { sourceSchema, sourceDraftSchema } from "./source";
import { moduleSchema } from "./module";
import { curriculumProgressSchema } from "./progress";
import { learningStatusSchema } from "./learning-status";
import { speedSchema } from "./adaptive";
import { depthLevelSchema } from "./depth";
import { levelSchema } from "./level";
import { curriculumDomainNodeMappingSchema } from "./domain-map";

const docUrlSchema = z
  .string()
  .url()
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "docUrl must be an absolute http(s) URL",
  });

export const curriculumStatusSchema = z.enum([
  "draft",
  "curating",
  "awaiting_source_approval",
  "shaping_structure",
  "ready",
  "confirmed",
  "failed",
]);

export type CurriculumStatus = z.infer<typeof curriculumStatusSchema>;

export const curriculumOriginSchema = z.enum(["sources", "research"]);

export type CurriculumOrigin = z.infer<typeof curriculumOriginSchema>;

export const curriculumSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: curriculumStatusSchema,
  learningStatus: learningStatusSchema,
  speed: speedSchema,
  hinting: z.boolean(),
  defaultDepth: depthLevelSchema,
  origin: curriculumOriginSchema,
  strictOrder: z.boolean(),
  preAssessmentCompletedAt: z.string().nullable(),
  // decouple-curricula-from-domain-nodes (issue #84) — no longer a stored
  // column (curricula.domain_node_id was migrated and dropped). DERIVED at
  // read time: the most recently confirmed curriculum_domain_node_mappings
  // row for this curriculum, or null if none is confirmed. Kept as a
  // single-value field purely for backward compatibility with the existing
  // "change placement" UI (apps/web/src/domain-map/curriculum-placement-
  // panel.tsx), which predates the many-to-many model this ticket
  // introduces — CurriculumDetail.domainMappings below is the full list.
  domainNodeId: z.string().nullable(),
  // course-priority-reordering (#69) — drag-and-drop learner-controlled
  // order within a subject. Scoped per subject. Assigned by nextOrder()
  // at create time; updated by reorder endpoint inside transaction.
  order: z.number().int(),
});

export type Curriculum = z.infer<typeof curriculumSchema>;

export const createCurriculumInput = z.object({
  subjectId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  sources: z.array(sourceDraftSchema).default([]),
  researchTopic: z.string().min(1).nullable().optional(),
  docUrl: docUrlSchema.nullable().optional(),
  pastedMaterial: z.string().min(1).nullable().optional(),
  preferredLevel: levelSchema.nullable().optional(),
  // Explicit domain-tree placement (the tree UI's "add course here"). When
  // absent, resolveDomainPlacement() decides via a normalized-name match or
  // the sibling-discovery agent — see apps/api/src/domain-map/
  // domain-placement.orchestrator.ts.
  domainNodeId: z.string().nullable().optional(),
});

export type CreateCurriculumInput = z.infer<typeof createCurriculumInput>;

export const addSourcesInput = z.object({
  curriculumId: z.string(),
  sources: z.array(sourceDraftSchema).min(1),
});

export type AddSourcesInput = z.infer<typeof addSourcesInput>;

export const approveSourcesInput = z.object({
  override: z.boolean().optional(),
});

export type ApproveSourcesInput = z.infer<typeof approveSourcesInput>;

export const updateCurriculumInput = z.object({
  curriculumId: z.string(),
  learningStatus: learningStatusSchema.optional(),
  speed: speedSchema.optional(),
  hinting: z.boolean().optional(),
  defaultDepth: depthLevelSchema.optional(),
  strictOrder: z.boolean().optional(),
  // "Change placement" (SCENARIO 9) — re-points which domain node the
  // curriculum is attached under. A plain field update, same shape as
  // speed/hinting/defaultDepth; never restructures domain_nodes itself.
  domainNodeId: z.string().nullable().optional(),
});

export type UpdateCurriculumInput = z.infer<typeof updateCurriculumInput>;

export const curriculumDetailSchema = z.object({
  curriculum: curriculumSchema,
  sources: z.array(sourceSchema),
  modules: z.array(moduleSchema),
  progress: curriculumProgressSchema,
  recommendedTopicId: z.string().nullable(),
  hasCitableSources: z.boolean(),
  // True once `generateDraftStructure` has been attempted at least once for
  // this curriculum (a placeholder turn is written before the agent call,
  // so this stays accurate even when that attempt failed outright) — the
  // signal `FailedBanner` uses to tell a Phase 5 draft-generation failure
  // apart from an old pre-Phase-5 research/parse failure, which never
  // touches `curriculum_structure_turns` at all.
  hasStructureDraftAttempt: z.boolean(),
  // decouple-curricula-from-domain-nodes (issue #84) — every
  // curriculum_domain_node_mappings row for this curriculum (suggested,
  // confirmed, and rejected alike), for the new "Map to taxonomy" panel
  // (apps/web/src/curriculum/curriculum-domain-mapping-panel.tsx).
  domainMappings: z.array(curriculumDomainNodeMappingSchema),
});

export type CurriculumDetail = z.infer<typeof curriculumDetailSchema>;

// Draft-structure shaping (Phase 5). This is the ONE definition of the
// architect agents' structured-output shape for a proposed learning map —
// `apps/api/src/curriculum/curriculum-research-plan.ts`'s `docResearchPlanSchema`
// re-exports this schema directly rather than mirroring it, so a
// draft/snapshot never needs a transform step between "what the agent
// returned" and "what gets stored/sent over the wire".
export const structureSnapshotTopicSchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  suggestedDepth: depthLevelSchema,
});

export type StructureSnapshotTopic = z.infer<typeof structureSnapshotTopicSchema>;

export const structureSnapshotModuleSchema = z.object({
  title: z.string(),
  level: levelSchema,
  topics: z.array(structureSnapshotTopicSchema),
  tags: z.array(z.string()).nullable(),
});

export type StructureSnapshotModule = z.infer<typeof structureSnapshotModuleSchema>;

export const structureSnapshotSchema = z.object({
  modules: z.array(structureSnapshotModuleSchema).min(1),
  strictOrder: z.boolean().nullable(),
});

export type StructureSnapshot = z.infer<typeof structureSnapshotSchema>;

export const structureTurnRoleSchema = z.enum(["user", "assistant"]);

export type StructureTurnRole = z.infer<typeof structureTurnRoleSchema>;

// "pending" marks an assistant turn whose agent call hasn't resolved yet —
// written immediately, before the agent is called, so a crash mid-turn
// leaves a durable trace instead of silently losing the attempt. A turn
// found still "pending" on the next request is evidence of exactly that
// crash (see `curriculum-structure.ts`'s `finalizeStalePendingTurn`) and
// gets finalized as "failed" before the new turn proceeds.
export const structureTurnStatusSchema = z.enum(["pending", "complete", "failed"]);

export type StructureTurnStatus = z.infer<typeof structureTurnStatusSchema>;

// A proposal recorded by the `suggestSplitIntoCourses` tool (Phase 5's
// tool-calling structure editor) — proposal-only, never executes on its
// own. The frontend renders this as confirm/decline affordances; actual
// splitting only happens once the learner confirms in a following turn,
// which drives the agent to call `splitModuleIntoNewCourse` per group.
export const splitSuggestionGroupSchema = z.object({
  courseName: z.string(),
  moduleTitles: z.array(z.string()),
});

export const splitSuggestionSchema = z.object({
  reason: z.string(),
  groups: z.array(splitSuggestionGroupSchema),
});

export type SplitSuggestion = z.infer<typeof splitSuggestionSchema>;

// Mirrors `sourceApprovalStatusSchema` (Phase 1's `sources.approval_status`)
// with one addition: a candidate the learner explicitly removed is recorded
// as `rejected` rather than deleted outright, since these rows also carry
// which flagged module/topic (`label`) surfaced them — worth keeping for
// the conversation's own audit trail even once decided.
export const researchCandidateApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export type ResearchCandidateApprovalStatus = z.infer<
  typeof researchCandidateApprovalStatusSchema
>;

// A candidate surfaced by the SUPPLEMENTAL (research-gap-triggered) trusted-
// source search in a structure-shaping chat turn (Phase 5) — gathered but
// held for explicit learner approval before ever reaching the
// structure-editor agent's prompt, the same review gate Phase 1's
// `SourceApprovalPanel` applies to a course's original sources, just at a
// later point in the curriculum's lifecycle and for a different table.
export const structureResearchCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  value: z.string(),
  approvalStatus: researchCandidateApprovalStatusSchema,
});

export type StructureResearchCandidate = z.infer<
  typeof structureResearchCandidateSchema
>;

export const structureTurnSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  role: structureTurnRoleSchema,
  message: z.string(),
  structureSnapshot: structureSnapshotSchema.nullable(),
  splitSuggestion: splitSuggestionSchema.nullable(),
  toolActions: z.array(z.string()),
  status: structureTurnStatusSchema,
  // Candidates this turn surfaced that are still awaiting the learner's
  // approve/reject decision — empty once resolved (via
  // `resolveSupplementalResearch`) or if this turn never surfaced any.
  // Only meaningful on the latest assistant turn, same as `splitSuggestion`.
  pendingResearchCandidates: z.array(structureResearchCandidateSchema),
  createdAt: z.string(),
});

export type StructureTurn = z.infer<typeof structureTurnSchema>;

export const submitStructureTurnInput = z.object({
  message: z.string().min(1),
  researchGapLabels: z.array(z.string()).optional(),
});

export type SubmitStructureTurnInput = z.infer<typeof submitStructureTurnInput>;

// Step 2 of the supplemental-research review gate (see
// `curriculum-structure.ts`'s `resolveSupplementalResearch`): the learner's
// decision on the candidates a prior turn surfaced. An empty
// `approvedCandidateIds` means "skip these" — every surfaced candidate is
// rejected and the edit proceeds using only the always-on trusted-source
// search, exactly as if `researchGapLabels` had never been flagged.
export const resolveSupplementalResearchInput = z.object({
  approvedCandidateIds: z.array(z.string()),
});

export type ResolveSupplementalResearchInput = z.infer<
  typeof resolveSupplementalResearchInput
>;

export const mergeCurriculaInput = z.object({
  sourceCurriculumId: z.string(),
});

export type MergeCurriculaInput = z.infer<typeof mergeCurriculaInput>;

export const mergeCurriculaResultSchema = z.object({
  targetCurriculumId: z.string(),
  sourceCurriculumId: z.string(),
  modulesMoved: z.number(),
  topicsMoved: z.number(),
  sourcesMoved: z.number(),
  socraticSessionsMoved: z.number(),
  probeSessionsMoved: z.number(),
});

export type MergeCurriculaResult = z.infer<typeof mergeCurriculaResultSchema>;

export const moveCurriculumInput = z.object({
  targetSubjectId: z.string(),
});

export type MoveCurriculumInput = z.infer<typeof moveCurriculumInput>;

export const reorderCurriculaInput = z.object({
  orderedIds: z.string().array(),
});

export type ReorderCurriculaInput = z.infer<typeof reorderCurriculaInput>;

export const courseRefocusReasonSchema = z.enum([
  "stale_top_priority",
  "new_high_priority_ignored",
]);

export type CourseRefocusReason = z.infer<typeof courseRefocusReasonSchema>;

export const courseRefocusSuggestionSchema = z.object({
  curriculumId: z.string(),
  subjectId: z.string(),
  subjectName: z.string(),
  courseName: z.string(),
  reason: courseRefocusReasonSchema,
  dismissedAt: z.string().nullable(),
});

export type CourseRefocusSuggestion = z.infer<typeof courseRefocusSuggestionSchema>;
