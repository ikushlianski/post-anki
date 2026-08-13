import { z } from "zod";

export const milestoneEntityTypeSchema = z.enum(["curriculum", "domain_node"]);

export type MilestoneEntityType = z.infer<typeof milestoneEntityTypeSchema>;

// "full_mastery" is the only value that ships in v1, but this is kept as an
// open string (see milestoneCriteriaKeySchema below), not a fixed enum,
// mirroring domain_node_links.kind's same "stays open" precedent — a future
// criteria type (e.g. "first week of activity") needs no migration.
export const FULL_MASTERY_CRITERIA_KEY = "full_mastery";

export const milestoneCriteriaKeySchema = z.string().min(1);

export type MilestoneCriteriaKey = z.infer<typeof milestoneCriteriaKeySchema>;

// A one-time, un-losable award record. `entityLabel` is resolved at read
// time from the entity's current name (curriculum name / domain node name),
// not stored on the row — it is display metadata, not part of the
// completion fact, and never re-derives whether the milestone still holds.
// Nullable because the underlying curriculum/domain node can be deleted
// after the milestone was awarded (Scenario 7: deletion never cascades to
// milestones) — the award itself must still render.
export const milestoneSchema = z.object({
  id: z.string(),
  entityType: milestoneEntityTypeSchema,
  entityId: z.string(),
  entityLabel: z.string().nullable(),
  criteriaKey: milestoneCriteriaKeySchema,
  achievedAt: z.string(),
  createdAt: z.string(),
});

export type Milestone = z.infer<typeof milestoneSchema>;
