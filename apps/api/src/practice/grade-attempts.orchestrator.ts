import type { PracticeLevel } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { gradeBatchSchema, type GradeBatch } from "./practice-batch.schemas.js";
import { getPhrasesByIds, insertAttempts, type AttemptInsertRow } from "./practice.repo.js";

export interface AnswerInput {
  phraseId: string;
  userAnswer: string;
}

export interface GradeItem {
  russian: string;
  referenceEnglish: string;
  userAnswer: string;
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

export async function gradeAttempts(
  subjectId: string,
  level: PracticeLevel,
  answers: AnswerInput[],
): Promise<AttemptInsertRow[]> {
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

  log.info({ subjectId, count: rows.length }, "attempts_graded");

  return rows;
}
