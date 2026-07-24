import type { Pack, PracticeLevel } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { phraseBatchSchema, type PhraseBatch } from "./practice-batch.schemas.js";
import {
  insertPhraseBatch,
  recentRussianForSubject,
  type PhraseInsertRow,
} from "./practice.repo.js";

const BATCH_SIZE = 10;

export function buildPhraseBatchPrompt(
  level: PracticeLevel,
  pack: Pack,
  avoidRussian: string[],
  count: number,
): string {
  const avoidBlock =
    avoidRussian.length > 0
      ? avoidRussian.map((r) => `- ${r}`).join("\n")
      : "(none yet — this is the first batch for this level/pack)";

  return [
    `Level: ${level}`,
    `Pack: ${pack}`,
    "",
    "Do not reuse any of these already-seen sentences:",
    avoidBlock,
    "",
    `Generate exactly ${count} items.`,
  ].join("\n");
}

export function toPhraseRows(
  subjectId: string,
  batchId: string,
  level: PracticeLevel,
  pack: Pack,
  generated: PhraseBatch,
  makeId: (index: number) => string = () => newId("phrase"),
): PhraseInsertRow[] {
  return generated.phrases.map((p, index) => ({
    id: makeId(index),
    subjectId,
    batchId,
    level,
    pack,
    position: index + 1,
    russian: p.russian,
    referenceEnglish: p.referenceEnglish,
    domain: p.domain,
  }));
}

export async function generatePhraseBatch(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
): Promise<PhraseInsertRow[]> {
  const avoidRussian = await recentRussianForSubject(subjectId, level, pack);
  const agent = getMastra().getAgent(AGENT_KEYS.phraseBatchGenerate);
  const prompt = buildPhraseBatchPrompt(level, pack, avoidRussian, BATCH_SIZE);

  const result = await agent.generate(prompt, {
    structuredOutput: { schema: phraseBatchSchema },
  });

  if (!result.object) {
    throw new Error("phrase batch agent returned no structured output");
  }

  const batchId = newId("batch");
  const rows = toPhraseRows(subjectId, batchId, level, pack, result.object);

  await insertPhraseBatch(rows);

  log.info({ subjectId, batchId, count: rows.length }, "phrase_batch_generated");

  return rows;
}
