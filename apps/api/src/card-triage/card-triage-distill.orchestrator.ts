import { and, asc, desc, eq, gte, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { STYLE_NOTE_MAX_CHARS, STYLE_NOTES_MAX_COUNT, TRIAGE_CARD_FEEDBACK_MAX_ITEMS } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { cardTriageDecisions, knowledgeBitFeedback } from "../db/schema.js";
import { log } from "../shared/log.js";
import {
  runCardStyleNotesDistiller,
  type CardFeedbackItem,
  type DistillerInput,
} from "../mastra/card-style-notes-distiller.agent.js";
import { listActiveStyleNotes, replaceActiveStyleNotes, type NewStyleNote } from "./card-style-note.repo.js";
import { getTriageSessionRow, type TriageSessionRow } from "./card-triage-session.repo.js";

const REJECTED_EXAMPLES_LIMIT = 10;

export type DistillOutcome = "distilled" | "saved_text_only" | "skipped";

export interface DistillDeps {
  run: typeof runCardStyleNotesDistiller;
  loadInput: (session: TriageSessionRow) => Promise<DistillerInput>;
  replace: typeof replaceActiveStyleNotes;
}

async function loadRejectedExamples(session: TriageSessionRow): Promise<string[]> {
  const rows = await getDb()
    .select({ statement: knowledgeBitFeedback.statement, front: knowledgeBitFeedback.front })
    .from(knowledgeBitFeedback)
    .where(
      and(
        eq(knowledgeBitFeedback.verdict, "rejected"),
        gte(knowledgeBitFeedback.createdAt, session.startedAt),
        session.subjectId ? eq(knowledgeBitFeedback.subjectId, session.subjectId) : undefined,
      ),
    )
    .orderBy(desc(knowledgeBitFeedback.createdAt))
    .limit(REJECTED_EXAMPLES_LIMIT);

  return rows.map((row) => (row.front ?? row.statement).slice(0, STYLE_NOTE_MAX_CHARS));
}

export async function loadCardFeedback(sessionId: string): Promise<CardFeedbackItem[]> {
  const rows = await getDb()
    .select({
      verdict: cardTriageDecisions.verdict,
      reasonCode: cardTriageDecisions.reasonCode,
      note: cardTriageDecisions.note,
      front: cardTriageDecisions.front,
    })
    .from(cardTriageDecisions)
    .where(
      and(
        eq(cardTriageDecisions.sessionId, sessionId),
        isNull(cardTriageDecisions.undoneAt),
        or(
          isNotNull(cardTriageDecisions.note),
          and(isNotNull(cardTriageDecisions.reasonCode), ne(cardTriageDecisions.reasonCode, "unspecified")),
        ),
      ),
    )
    .orderBy(
      sql`case when ${cardTriageDecisions.verdict} = 'rejected' then 0 else 1 end`,
      asc(cardTriageDecisions.orderIndex),
    )
    .limit(TRIAGE_CARD_FEEDBACK_MAX_ITEMS);

  return rows.map((row) => ({
    verdict: row.verdict === "rejected" ? "rejected" : "approved",
    reason: row.reasonCode && row.reasonCode !== "unspecified" ? row.reasonCode : null,
    note: row.note,
    front: row.front,
  }));
}

async function defaultLoadInput(session: TriageSessionRow): Promise<DistillerInput> {
  const current = await listActiveStyleNotes(session.subjectId, { enabledOnly: true });

  return {
    feedbackText: session.feedbackText ?? "",
    acceptedCount: session.acceptedCount,
    rejectedCount: session.rejectedCount,
    rejectedExamples: await loadRejectedExamples(session),
    cardFeedback: await loadCardFeedback(session.id),
    currentNotes: current.map((note) => ({ text: note.text, scope: note.subjectId === null ? "global" : "subject" })),
  };
}

export function defaultDistillDeps(): DistillDeps {
  return { run: runCardStyleNotesDistiller, loadInput: defaultLoadInput, replace: replaceActiveStyleNotes };
}

export function toNewStyleNotes(
  proposed: { text: string; scope: "subject" | "global" }[],
  sessionSubjectId: string | null,
): NewStyleNote[] {
  const seen = new Set<string>();
  const notes: NewStyleNote[] = [];

  for (const item of proposed) {
    const text = item.text.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();

    if (text === "" || seen.has(key)) {
      continue;
    }

    seen.add(key);
    notes.push({ text, subjectId: item.scope === "global" ? null : sessionSubjectId });
  }

  return notes.slice(0, STYLE_NOTES_MAX_COUNT);
}

// A failed or invalid distil call leaves the saved text and status saved_text_only for a retry.
export async function distillTriageSession(
  sessionId: string,
  deps: DistillDeps = defaultDistillDeps(),
): Promise<DistillOutcome> {
  const session = await getTriageSessionRow(sessionId);

  if (!session || session.status !== "saved_text_only") {
    return "skipped";
  }

  try {
    const input = await deps.loadInput(session);

    if (input.feedbackText === "" && input.cardFeedback.length === 0) {
      return "skipped";
    }

    const proposed = await deps.run(input);

    await deps.replace(session.id, session.subjectId, toNewStyleNotes(proposed, session.subjectId));

    return "distilled";
  } catch (err) {
    log.warn({ sessionId, errorName: err instanceof Error ? err.name : "unknown" }, "card_triage_distill_failed");

    return "saved_text_only";
  }
}
