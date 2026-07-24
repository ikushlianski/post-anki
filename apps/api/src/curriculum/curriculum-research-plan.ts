import { z } from "zod";
import { structureSnapshotSchema } from "@post-anki/shared";

// This IS the architect agents' structured-output contract for a proposed
// learning map — re-exported from `@post-anki/shared` rather than redefined
// here, so the shape the LLM must return, the shape stored on
// `curriculum_structure_turns.structureSnapshot`, and the shape sent to the
// frontend are always the exact same schema (see that file's comment on
// `structureSnapshotSchema` for why this matters for Phase 5's draft-
// structure shaping).
export const docResearchPlanSchema = structureSnapshotSchema;

export type DocResearchPlan = z.infer<typeof docResearchPlanSchema>;
