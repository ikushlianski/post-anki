import type { Gap, SocraticSessionSummary } from "@post-anki/shared";
import { gapMaturity } from "@post-anki/core";
import { rowDepth, type TopicRow } from "../topic/topic-progress.repo.js";
import type { SocraticTurnRow } from "./socratic.repo.js";

export const SESSION_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export function buildSessionSummary(
  turns: SocraticTurnRow[],
  topicRow: TopicRow,
  gaps: Gap[],
): SocraticSessionSummary {
  const answered = turns.filter((t) => t.answeredAt);
  const solidConcepts = [
    ...new Set(
      answered.filter((t) => t.action === "advance").map((t) => t.conceptLabel),
    ),
  ];
  const depth = rowDepth(topicRow);

  return {
    topicTitle: topicRow.title,
    depth,
    solidConcepts,
    // Structurally empty today — see the WHY comment on
    // socraticSessionSummarySchema in packages/shared/src/socratic.ts
    // (spec.md Decision 1 / issue #27's "Flagged for Ilya"). Deliberately
    // NOT derived from turns whose `action !== "advance"` — that would
    // silently convert an AI-inferred "you struggled here" signal into a
    // #28-style logged gap, which #28's own explicit-consent design
    // forbids.
    mostRecentGap: null,
    gapsLoggedCount: 0,
    crossCuttingConcerns: [],
    exchangeCount: answered.length,
    topicMaturity: gapMaturity(gaps, depth),
  };
}

// Last-activity signal for the 30-minute inactivity sweep (spec.md Decision
// 5) — the pending (unanswered) turn's createdAt, never
// chat_context.updated_at (polluted by unrelated menu-browsing writes).
// Falls back to the most recently answered turn's answeredAt for the
// gap-mastery-cascade-delete edge case where a session is "active" with no
// pending turn at all.
export function lastActivityAt(
  pending: SocraticTurnRow | null,
  turns: SocraticTurnRow[],
): Date {
  if (pending) {
    return pending.createdAt;
  }

  const lastAnswered = turns.filter((t) => t.answeredAt).at(-1);

  return lastAnswered?.answeredAt ?? turns[0]!.createdAt;
}
