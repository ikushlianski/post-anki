import { and, eq, notInArray } from "drizzle-orm";
import { knowledgeBits } from "../db/schema.js";

const DISCARDED_STATES = ["rejected", "superseded"] as const;

export interface VariantGenerationScope {
  // Explicit, user-triggered generation for one bit may still fill an approved bit.
  includeApproved?: boolean;
  bitId?: string;
}

// Background scans must not re-create variants of an approved bit: triage soft-removes the
// ones the reviewer dropped, and a fresh active row in a dropped slot would undo that.
export function bitOpenForVariantGeneration(scope: VariantGenerationScope = {}) {
  return and(
    notInArray(
      knowledgeBits.approvalState,
      scope.includeApproved ? [...DISCARDED_STATES] : [...DISCARDED_STATES, "approved"],
    ),
    scope.bitId ? eq(knowledgeBits.id, scope.bitId) : undefined,
  );
}
