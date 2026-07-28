import type { PracticeLevel, Verdict } from "@post-anki/shared";
import { applyAttemptToPhraseBankEntry } from "@post-anki/core";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { getDb } from "../db/client.js";
import { gradeBatchSchema, type GradeBatch } from "./practice-batch.schemas.js";
import { getPhrasesByIds, insertAttempts, type AttemptInsertRow } from "./practice.repo.js";
import {
  getPhraseBankEntriesByIdsForUpdate,
  insertPhraseBankAppearance,
  toEntryState,
  updatePhraseBankEntryAfterAttempt,
  type DuePhraseBankEntry,
  type PhraseBankAppearanceInsertRow,
} from "./phrase-bank.repo.js";

export interface AnswerInput {
  phraseId: string;
  userAnswer: string;
}

export interface GradeItem {
  russian: string;
  referenceEnglish: string;
  userAnswer: string;
}

export interface GradeAttemptsResult {
  attempts: AttemptInsertRow[];
  phraseBankUpdates: PhraseBankMasteryOutcome["nextEntry"][];
}

export function buildGradeBatchPrompt(level: PracticeLevel, items: GradeItem[]): string {
  const itemBlocks = items.map(
    (item, index) =>
      [
        `Item ${index + 1}:`,
        `Russian: ${item.russian}`,
        `Reference native translation: ${item.referenceEnglish}`,
        `Learner's answer: ${item.userAnswer}`,
      ].join("\n"),
  );

  return [
    `Level: ${level}`,
    "",
    "Grade each item independently, in the same order given:",
    itemBlocks.join("\n\n"),
    "",
    `Return exactly ${items.length} graded results, in the same order.`,
  ].join("\n");
}

// Positional reattachment: the agent is instructed to return graded results in the
// same order the items were given, and this mapper trusts that ordering to reattach
// each grade to its phraseId — faithfully porting the source app's proven design
// rather than hardening it with an id-echo round trip the model would have to honor.
export function toAttemptRows(
  subjectId: string,
  graded: GradeBatch,
  originalAnswers: AnswerInput[],
  makeId: (index: number) => string = () => newId("attempt"),
): AttemptInsertRow[] {
  const count = Math.min(graded.gradedAnswers.length, originalAnswers.length);

  return Array.from({ length: count }, (_, index) => {
    const answer = originalAnswers[index]!;
    const grade = graded.gradedAnswers[index]!;

    return {
      id: makeId(index),
      subjectId,
      phraseId: answer.phraseId,
      userAnswer: answer.userAnswer,
      score: grade.score,
      verdict: grade.verdict,
      feedback: grade.feedback,
      nativeAlternatives: grade.nativeAlternatives,
    };
  });
}

export interface PhraseBankAttemptInput {
  phraseBankEntryId: string;
  phraseId: string;
  sequenceNumber: number;
  verdict: Verdict;
  score: number;
}

export interface PhraseBankMasteryOutcome {
  entryId: string;
  // Carries phraseText/category through (not just bare state) so Phase 2's
  // "you mastered X" indicator can name the phrase without a second fetch.
  nextEntry: DuePhraseBankEntry;
  justMastered: boolean;
  appearance: PhraseBankAppearanceInsertRow;
}

// Pure orchestration wiring: reads/writes the deriver's state through an in-memory
// map so the mastery algorithm itself is never re-implemented here (SCENARIO 10) —
// this only decides what gets persisted, using applyAttemptToPhraseBankEntry as the
// single source of truth for the state transition.
export function applyPhraseBankAttempts(
  inputs: PhraseBankAttemptInput[],
  entriesById: Map<string, DuePhraseBankEntry>,
  makeAppearanceId: (index: number) => string = () => newId("pbappearance"),
): PhraseBankMasteryOutcome[] {
  const outcomes: PhraseBankMasteryOutcome[] = [];

  inputs.forEach((input, index) => {
    const current = entriesById.get(input.phraseBankEntryId);

    if (!current) {
      log.warn({ phraseBankEntryId: input.phraseBankEntryId }, "phrase_bank_entry_not_found");
      return;
    }

    const { entry, appearance } = applyAttemptToPhraseBankEntry(current, {
      sequenceNumber: input.sequenceNumber,
      verdict: input.verdict,
    });

    const nextEntry = { ...entry, id: input.phraseBankEntryId };

    entriesById.set(input.phraseBankEntryId, nextEntry);

    outcomes.push({
      entryId: input.phraseBankEntryId,
      nextEntry,
      justMastered: current.status !== "mastered" && entry.status === "mastered",
      appearance: {
        id: makeAppearanceId(index),
        phraseBankEntryId: input.phraseBankEntryId,
        phraseId: input.phraseId,
        sentenceCount: input.sequenceNumber,
        result: appearance.result,
        score: input.score,
        wasOverdue: appearance.wasOverdue,
      },
    });
  });

  return outcomes;
}

export async function gradeAttempts(
  subjectId: string,
  level: PracticeLevel,
  answers: AnswerInput[],
): Promise<GradeAttemptsResult> {
  const phraseRows = await getPhrasesByIds(answers.map((a) => a.phraseId));
  const phraseById = new Map(phraseRows.map((p) => [p.id, p]));

  const items: GradeItem[] = answers.map((a) => {
    const phrase = phraseById.get(a.phraseId);

    return {
      russian: phrase?.russian ?? "",
      referenceEnglish: phrase?.referenceEnglish ?? "",
      userAnswer: a.userAnswer,
    };
  });

  const agent = getMastra().getAgent(AGENT_KEYS.gradeBatch);
  const prompt = buildGradeBatchPrompt(level, items);

  const result = await agent.generate(prompt, {
    structuredOutput: { schema: gradeBatchSchema },
  });

  if (!result.object) {
    throw new Error("grade batch agent returned no structured output");
  }

  const rows = toAttemptRows(subjectId, result.object, answers);

  await insertAttempts(rows);

  const phraseBankUpdates = await applyPhraseBankUpdates(answers, phraseById, result.object);

  log.info({ subjectId, count: rows.length }, "attempts_graded");

  return { attempts: rows, phraseBankUpdates };
}

async function applyPhraseBankUpdates(
  answers: AnswerInput[],
  phraseById: Map<string, { targetPhraseBankEntryId: string | null; sequenceNumber: number }>,
  graded: GradeBatch,
): Promise<PhraseBankMasteryOutcome["nextEntry"][]> {
  const count = Math.min(graded.gradedAnswers.length, answers.length);

  const inputs: PhraseBankAttemptInput[] = [];

  for (let index = 0; index < count; index += 1) {
    const answer = answers[index]!;
    const grade = graded.gradedAnswers[index]!;
    const phrase = phraseById.get(answer.phraseId);

    if (!phrase?.targetPhraseBankEntryId) {
      continue;
    }

    inputs.push({
      phraseBankEntryId: phrase.targetPhraseBankEntryId,
      phraseId: answer.phraseId,
      sequenceNumber: phrase.sequenceNumber,
      verdict: grade.verdict,
      score: grade.score,
    });
  }

  if (inputs.length === 0) {
    return [];
  }

  const entryIds = [...new Set(inputs.map((i) => i.phraseBankEntryId))];

  // Read-compute-write, all inside one transaction (architecture.md's "Race
  // 3 — grading's lost-update fix"). The read is SELECT ... FOR UPDATE
  // (rows locked in id order to avoid deadlock — see
  // getPhraseBankEntriesByIdsForUpdate), which blocks a second concurrent
  // grading call touching the same entry until this transaction commits, so
  // that call's own read then sees genuinely current state instead of a
  // stale snapshot. Every DB call in this body takes `tx` explicitly — never
  // the default getDb() parameter (spec.md's Design-integrity requirement;
  // the pool caps at 4 connections).
  const outcomes = await getDb().transaction(async (tx) => {
    const entryRows = await getPhraseBankEntriesByIdsForUpdate(entryIds, tx);
    const entriesById = new Map(entryRows.map((row) => [row.id, toEntryState(row)]));

    const computedOutcomes = applyPhraseBankAttempts(inputs, entriesById);

    // Sequential, not Promise.all: two outcomes can target the same entry within one
    // grading pass, and each already carries the cumulative state through it (built
    // from the same mutating map above) — writing out of order would let an earlier,
    // less-progressed outcome overwrite a later one's persisted state.
    for (const outcome of computedOutcomes) {
      await updatePhraseBankEntryAfterAttempt(
        outcome.entryId,
        outcome.nextEntry,
        {
          correct: outcome.appearance.result === "correct",
          justMastered: outcome.justMastered,
        },
        tx,
      );
      await insertPhraseBankAppearance(outcome.appearance, tx);
    }

    return computedOutcomes;
  });

  return outcomes.map((outcome) => outcome.nextEntry);
}
