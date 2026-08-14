import { z } from "zod";

// LRU archetype rotation (issue #36) — canonical order IS declaration order,
// the single source of truth for the tiebreak rule in
// packages/core/src/probe-session/archetype-rotation.ts's selectArchetype.
export const archetypeSchema = z.enum([
  "scenario_based",
  "compare_contrast",
  "design_challenge",
  "cross_cutting",
  "debug_challenge",
]);

export type Archetype = z.infer<typeof archetypeSchema>;

export const ARCHETYPE_CANONICAL_ORDER: readonly Archetype[] = archetypeSchema.options;
