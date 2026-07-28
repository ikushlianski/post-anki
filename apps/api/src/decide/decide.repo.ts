import { desc, eq } from "drizzle-orm";
import type { DecideBlindSpot, DecideBlindSpotStatus, DecideSession } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { decideBlindSpots, decideSessions } from "../db/schema.js";
import { newId } from "../shared/id.js";

export interface InsertDecideSessionParams {
  id: string;
  decision: string;
  opinion: string;
  verdict: string;
  strengths: string[];
  questions: string[];
  blindSpots: string[];
}

function toDecideBlindSpot(row: typeof decideBlindSpots.$inferSelect): DecideBlindSpot {
  return {
    id: row.id,
    description: row.description,
    status: row.status as DecideBlindSpotStatus,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

function toDecideSession(
  row: typeof decideSessions.$inferSelect,
  blindSpots: DecideBlindSpot[],
): DecideSession {
  return {
    id: row.id,
    decision: row.decision,
    opinion: row.opinion,
    verdict: row.verdict,
    strengths: row.strengths,
    questions: row.questions,
    blindSpots,
    createdAt: row.createdAt.toISOString(),
  };
}

// Inserts one decide_sessions row plus one decide_blind_spots row per
// string in params.blindSpots, each with its own server-generated id
// (newId — the same pattern insertPrioritySuggestion already uses for
// domain_priority_suggestions; the decide agent's own schema stays
// blindSpots: string[], unchanged). Returns the full, persisted
// DecideSession shape.
export async function insertDecideSession(
  params: InsertDecideSessionParams,
): Promise<DecideSession> {
  const db = getDb();

  await db.insert(decideSessions).values({
    id: params.id,
    decision: params.decision,
    opinion: params.opinion,
    verdict: params.verdict,
    strengths: params.strengths,
    questions: params.questions,
  });

  const blindSpotRows =
    params.blindSpots.length > 0
      ? await db
          .insert(decideBlindSpots)
          .values(
            params.blindSpots.map((description) => ({
              id: newId("decideblindspot"),
              decideSessionId: params.id,
              description,
            })),
          )
          .returning()
      : [];

  const inserted = (
    await db.select().from(decideSessions).where(eq(decideSessions.id, params.id))
  )[0]!;

  return toDecideSession(inserted, blindSpotRows.map(toDecideBlindSpot));
}

// Newest-first, each session's blind spots nested inline (mirrors
// getPhraseBank's nested-response shape) — a small join, acceptable at this
// app's current, small personal-use scale (no pagination, matching
// writing_checks' own unpaginated GET).
export async function listDecideSessions(): Promise<DecideSession[]> {
  const db = getDb();

  const sessionRows = await db.select().from(decideSessions).orderBy(desc(decideSessions.createdAt));
  const blindSpotRows = await db.select().from(decideBlindSpots);

  const blindSpotsBySession = new Map<string, DecideBlindSpot[]>();

  for (const row of blindSpotRows) {
    const list = blindSpotsBySession.get(row.decideSessionId) ?? [];
    list.push(toDecideBlindSpot(row));
    blindSpotsBySession.set(row.decideSessionId, list);
  }

  return sessionRows.map((row) => toDecideSession(row, blindSpotsBySession.get(row.id) ?? []));
}

// PATCH /decide-blind-spots/:id. Sets status + resolvedAt on the targeted
// row only; never deleted, mirrors resolvePrioritySuggestion's persisted-
// not-deleted posture. Returns null for a non-existent id (mirrors
// resolvePrioritySuggestion's own not-found shape).
export async function updateDecideBlindSpotStatus(
  id: string,
  status: "accepted" | "rejected",
): Promise<DecideBlindSpot | null> {
  const db = getDb();

  const existing = (
    await db.select().from(decideBlindSpots).where(eq(decideBlindSpots.id, id))
  )[0];

  if (!existing) {
    return null;
  }

  const resolvedAt = new Date();

  await db
    .update(decideBlindSpots)
    .set({ status, resolvedAt })
    .where(eq(decideBlindSpots.id, id));

  return toDecideBlindSpot({ ...existing, status, resolvedAt });
}
