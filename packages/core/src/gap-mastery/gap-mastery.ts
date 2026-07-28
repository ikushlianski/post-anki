// Gap-specific selection/matching for the generalized recall-gap mastery
// mechanism (issue #57) — reuses packages/core/src/mastery/mastery-state.ts's
// generic derivers for the actual state transition; this file only carries
// the domain-specific knowledge (label matching, due-ranking for the quiz
// generator, session-identity adjacency).
import type { MasteryStatus } from "../mastery/mastery-state.js";

function normalizeGapLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface GapMatchCandidate {
  id: string;
  label: string;
}

/**
 * Mirrors matchExistingPhraseBankEntry's normalize/trim/lower match, scoped
 * to a topic's existing gaps instead of a subject/level/pack scope. Unlike
 * phrase-bank's matcher, this does NOT exclude any particular status —
 * a topic's gap set is small and a label collision should reuse the
 * existing gap regardless of its current open/covered/skipped state.
 */
export function matchExistingGapByLabel(
  candidates: GapMatchCandidate[],
  label: string,
): string | null {
  const normalized = normalizeGapLabel(label);
  const match = candidates.find((candidate) => normalizeGapLabel(candidate.label) === normalized);

  return match?.id ?? null;
}

export interface GapMasteryDueInfo {
  gapId: string;
  status: MasteryStatus;
  scheduledForSequence: number | null;
}

/**
 * The generative analogue of selectDuePhrases (mastery-state.ts's
 * selectDueMasteryEntries), feeding probe-session.generate.ts's "due-ranked"
 * selectGaps mode. A candidate gap with no mastery tracking at all (never
 * missed/answered through the probe-session quiz path) is always eligible —
 * existing "open-ranked" behavior, unchanged. A mastery-tracked gap is
 * eligible only once its schedule has arrived; a mastered gap is never
 * eligible (it should already read `covered` and not appear as an open
 * candidate, but excluded here too as a defensive floor).
 */
export function rankDueGapsForQuiz<T extends { id: string }>(
  candidates: T[],
  masteryByGapId: Map<string, GapMasteryDueInfo>,
  currentSequenceNumber: number,
): T[] {
  return candidates.filter((candidate) => {
    const mastery = masteryByGapId.get(candidate.id);

    if (!mastery) {
      return true;
    }

    if (mastery.status === "mastered") {
      return false;
    }

    return (
      mastery.scheduledForSequence !== null &&
      mastery.scheduledForSequence <= currentSequenceNumber
    );
  });
}

/**
 * The gap-specific "was this basically an immediate repeat" signal fed into
 * applyAttemptToMasteryEntry's caller-supplied `isAdjacent` input (spec.md
 * Decision 4). A correct answer only counts as a genuine non-adjacent
 * demonstration when it lands in a probe_sessions row DIFFERENT from the
 * one that produced the gap's last counted correct — a same-session
 * replenish re-serving the same gap and being answered correctly again is
 * the spam-worthy repeat this guards against, keyed by session identity
 * instead of phrase-bank's stream-position adjacency.
 */
export function computeGapAttemptIsAdjacent(
  currentProbeSessionId: string,
  lastCorrectSessionId: string | null,
): boolean {
  return lastCorrectSessionId !== null && currentProbeSessionId === lastCorrectSessionId;
}
