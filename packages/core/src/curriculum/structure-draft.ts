import type { StructureTurn } from "@post-anki/shared";

// The one number that decides "is this pending turn still legitimately
// running, or did the process that owned it die?" — shared by the API's
// self-heal sweep (`finalizeStalePendingTurn`) and the web app's stalled-draft
// UI (`draftProgressState` below), so the two surfaces can never drift into
// disagreeing about whether a turn is alive.
export const STALE_PENDING_TURN_AGE_MS = 5 * 60 * 1000;

type PendingTurnShape = Pick<StructureTurn, "role" | "status" | "createdAt">;

/**
 * `now` and `turn.createdAt` are both taken exactly as
 * `structureTurnSchema` declares them — a millisecond epoch and an ISO
 * string respectively — never a `Date`, so every call site coerces the
 * same way.
 */
export function isStalePendingTurn(turn: PendingTurnShape, now: number): boolean {
  if (turn.role !== "assistant" || turn.status !== "pending") {
    return false;
  }

  return now - new Date(turn.createdAt).getTime() >= STALE_PENDING_TURN_AGE_MS;
}

export type DraftProgressState = "idle" | "drafting" | "stalled";

type DraftTurnShape = Pick<StructureTurn, "role" | "status" | "createdAt" | "structureSnapshot">;

/**
 * Distinguishes the initial structure draft (no snapshot exists anywhere
 * yet, so a trailing pending assistant turn means "the very first draft is
 * being generated") from a mid-conversation edit turn (a snapshot already
 * exists, so a trailing pending turn there is `stuckPendingTurn`'s territory
 * with its own Resend affordance, not this one). Returns `"idle"` the moment
 * any turn carries a snapshot, regardless of what the trailing turn is
 * doing.
 */
export function draftProgressState(turns: DraftTurnShape[], now: number): DraftProgressState {
  const hasSnapshot = turns.some((turn) => turn.structureSnapshot);

  if (hasSnapshot) {
    return "idle";
  }

  const last = turns[turns.length - 1];

  if (!last || last.role !== "assistant" || last.status !== "pending") {
    return "idle";
  }

  return isStalePendingTurn(last, now) ? "stalled" : "drafting";
}
