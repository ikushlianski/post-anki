import { and, eq, type SQL } from "drizzle-orm";
import { curricula } from "../db/schema.js";

// Without a token (events sent before owners existed) the guard falls back to course id only.
export function ownedBy(curriculumId: string, ownerToken?: string): SQL | undefined {
  return ownerToken
    ? and(eq(curricula.id, curriculumId), eq(curricula.researchOwner, ownerToken))
    : eq(curricula.id, curriculumId);
}

export function ownerPatch(ownerToken?: string): { researchOwner?: string } {
  return ownerToken ? { researchOwner: ownerToken } : {};
}
