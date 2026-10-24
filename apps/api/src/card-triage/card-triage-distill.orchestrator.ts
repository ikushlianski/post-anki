import { and, desc, eq, gte } from "drizzle-orm";
import { STYLE_NOTE_MAX_CHARS, STYLE_NOTES_MAX_COUNT } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { knowledgeBitFeedback } from "../db/schema.js";
import { log } from "../shared/log.js";
import { runCardStyleNotesDistiller, type DistillerInput } from "../mastra/card-style-notes-distiller.agent.js";
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

async function defaultLoadInput(session: TriageSessionRow): Promise<DistillerInput> {
  const current = await listActiveStyleNotes(session.subjectId, { enabledOnly: true });

  return {
    feedbackText: session.feedbackText ?? "",
    acceptedCount: session.acceptedCount,
    rejectedCount: session.rejectedCount,
    rejectedExamples: await loadRejectedExamples(session),
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

  if (!session || session.status !== "saved_text_only" || !session.feedbackText) {
    return "skipped";
  }

  try {
    const proposed = await deps.run(await deps.loadInput(session));

    await deps.replace(session.id, session.subjectId, toNewStyleNotes(proposed, session.subjectId));

    return "distilled";
  } catch (err) {
    log.warn({ err, sessionId }, "card_triage_distill_failed");

    return "saved_text_only";
  }
}
