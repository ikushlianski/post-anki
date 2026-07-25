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
import {
  createPhraseBankEntry,
  dueEntriesForScope,
  matchExistingEntryId,
  nextSequenceBase,
} from "./phrase-bank.repo.js";

const BATCH_SIZE = 10;
const MAX_DUE_PER_BATCH = 3;

export function buildPhraseBatchPrompt(
  level: PracticeLevel,
  pack: Pack,
  avoidRussian: string[],
  count: number,
  dueEntries: { id: string; phraseText: string }[] = [],
): string {
  const avoidBlock =
    avoidRussian.length > 0
      ? avoidRussian.map((r) => `- ${r}`).join("\n")
      : "(none yet — this is the first batch for this level/pack)";

  const lines = [
    `Level: ${level}`,
    `Pack: ${pack}`,
    "",
    "Do not reuse any of these already-seen sentences:",
    avoidBlock,
  ];

  if (dueEntries.length > 0) {
    lines.push(
      "",
      "These phrases are due for recycling — weave each into exactly one natural",
      "sentence and echo its id back in that item's targetPhraseBankEntryId field.",
      "Never invent an id that isn't listed here:",
      ...dueEntries.map((d) => `- id=${d.id}: ${d.phraseText}`),
    );
  }

  lines.push("", `Generate exactly ${count} items.`);

  return lines.join("\n");
}

// Only the first (generation order) item echoing a given due-entry id is linked
// to it; any later duplicate echo, or an id absent from the due-entry set sent,
// degrades to untracked (null) rather than violating the phrases FK (SCENARIO 12).
export function resolveTargetPhraseBankEntryIds(
  dueEntryIds: string[],
  echoedIds: (string | null)[],
): (string | null)[] {
  const dueSet = new Set(dueEntryIds);
  const used = new Set<string>();

  return echoedIds.map((echoed) => {
    if (echoed === null || !dueSet.has(echoed) || used.has(echoed)) {
      return null;
    }

    used.add(echoed);

    return echoed;
  });
}

export function toPhraseRows(
  subjectId: string,
  batchId: string,
  level: PracticeLevel,
  pack: Pack,
  generated: PhraseBatch,
  sequenceNumberBase: number,
  targetPhraseBankEntryIds: (string | null)[],
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
    targetPhraseBankEntryId: targetPhraseBankEntryIds[index] ?? null,
    sequenceNumber: sequenceNumberBase + index + 1,
  }));
}

export async function generatePhraseBatch(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
): Promise<PhraseInsertRow[]> {
  const avoidRussian = await recentRussianForSubject(subjectId, level, pack);
  const sequenceNumberBase = await nextSequenceBase(subjectId, level, pack);
  const dueEntries = await dueEntriesForScope(
    subjectId,
    level,
    pack,
    sequenceNumberBase,
    MAX_DUE_PER_BATCH,
  );

  const agent = getMastra().getAgent(AGENT_KEYS.phraseBatchGenerate);
  const prompt = buildPhraseBatchPrompt(
    level,
    pack,
    avoidRussian,
    BATCH_SIZE,
    dueEntries.map((entry) => ({ id: entry.id, phraseText: entry.phraseText })),
  );

  const result = await agent.generate(prompt, {
    structuredOutput: { schema: phraseBatchSchema },
  });

  if (!result.object) {
    throw new Error("phrase batch agent returned no structured output");
  }

  const resolvedEchoedIds = resolveTargetPhraseBankEntryIds(
    dueEntries.map((entry) => entry.id),
    result.object.phrases.map((p) => p.targetPhraseBankEntryId),
  );

  const finalTargetIds = await linkOrCreateTargetPhrases(
    subjectId,
    level,
    pack,
    result.object,
    resolvedEchoedIds,
  );

  const batchId = newId("batch");
  const rows = toPhraseRows(
    subjectId,
    batchId,
    level,
    pack,
    result.object,
    sequenceNumberBase,
    finalTargetIds,
  );

  await insertPhraseBatch(rows);

  log.info(
    { subjectId, batchId, count: rows.length, dueCount: dueEntries.length },
    "phrase_batch_generated",
  );

  return rows;
}

// Sequential, not Promise.all: a duplicate newTargetPhrase text within the same
// batch must see the entry created by an earlier item in this same loop, so each
// lookup has to run after the previous item's possible insert has landed.
async function linkOrCreateTargetPhrases(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
  generated: PhraseBatch,
  resolvedEchoedIds: (string | null)[],
): Promise<(string | null)[]> {
  const finalTargetIds: (string | null)[] = [];

  for (let index = 0; index < generated.phrases.length; index += 1) {
    const echoed = resolvedEchoedIds[index] ?? null;

    if (echoed !== null) {
      finalTargetIds.push(echoed);
      continue;
    }

    const newTargetPhrase = generated.phrases[index]!.newTargetPhrase;

    if (!newTargetPhrase) {
      finalTargetIds.push(null);
      continue;
    }

    const existingId = await matchExistingEntryId(subjectId, level, pack, newTargetPhrase.text);

    if (existingId) {
      finalTargetIds.push(existingId);
      continue;
    }

    const id = newId("pbentry");

    await createPhraseBankEntry({
      id,
      subjectId,
      level,
      pack,
      phraseText: newTargetPhrase.text,
      category: newTargetPhrase.category,
    });

    finalTargetIds.push(id);
  }

  return finalTargetIds;
}
