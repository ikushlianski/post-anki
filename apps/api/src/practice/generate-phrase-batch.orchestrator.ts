import { sql } from "drizzle-orm";
import type { Pack, PracticeLevel } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { newId } from "../shared/id.js";
import { getDb, type DbExecutor } from "../db/client.js";
import { phraseBatchSchema, type PhraseBatch } from "./practice-batch.schemas.js";
import {
  insertPhraseBatch,
  recentRussianForSubject,
  type PhraseInsertRow,
  type PhraseSelectRow,
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
): Promise<PhraseSelectRow[]> {
  const avoidRussian = await recentRussianForSubject(subjectId, level, pack);
  // Early, unlocked read — used only to compute the due-entries list offered
  // to the model for recycling. Staleness here has no data-integrity
  // consequence (architecture.md's "Key design decision"): worst case the
  // model is offered a slightly stale due-list, which only affects which
  // phrase gets recycled a batch earlier or later.
  const promptSequenceNumberBase = await nextSequenceBase(subjectId, level, pack);
  const dueEntries = await dueEntriesForScope(
    subjectId,
    level,
    pack,
    promptSequenceNumberBase,
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

  // The LLM call stays outside the lock and the transaction — nothing about
  // it needs either, and holding one of the pool's 4 connections open for a
  // 1-5s external network call would be pure cost with no correctness
  // benefit (architecture.md).
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

  const generated = result.object;
  const batchId = newId("batch");

  // Everything from here down — the authoritative sequence-number re-read,
  // linking/creating phrase-bank entries, and the batch insert — runs inside
  // one transaction guarded by a Postgres advisory lock scoped to this
  // subject/level/pack tuple (architecture.md's "Proposed shape"). This
  // closes both race 1 (nextSequenceBase) and race 2
  // (linkOrCreateTargetPhrases) with a single lock scope, since both live
  // inside the same write window for the same scope. Every DB call in this
  // body takes `tx` explicitly — never the default getDb() parameter — so
  // every read/write here goes through the same connection that holds the
  // lock (spec.md's Design-integrity requirement; the pool caps at 4).
  const insertedRows = await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${subjectId} || ${level} || ${pack})::bigint)`);

    const sequenceNumberBase = await nextSequenceBase(subjectId, level, pack, tx);

    const finalTargetIds = await linkOrCreateTargetPhrases(
      subjectId,
      level,
      pack,
      generated,
      resolvedEchoedIds,
      tx,
    );

    const rows = toPhraseRows(subjectId, batchId, level, pack, generated, sequenceNumberBase, finalTargetIds);

    return insertPhraseBatch(rows, tx);
  });

  log.info(
    { subjectId, batchId, count: insertedRows.length, dueCount: dueEntries.length },
    "phrase_batch_generated",
  );

  return insertedRows;
}

// Sequential, not Promise.all: a duplicate newTargetPhrase text within the same
// batch must see the entry created by an earlier item in this same loop, so each
// lookup has to run after the previous item's possible insert has landed. `db`
// is required (no default) — this always runs inside generatePhraseBatch's
// locked transaction, and a default-parameter fallback here would silently
// read through a second, unlocked connection (spec.md's Design-integrity
// requirement).
async function linkOrCreateTargetPhrases(
  subjectId: string,
  level: PracticeLevel,
  pack: Pack,
  generated: PhraseBatch,
  resolvedEchoedIds: (string | null)[],
  db: DbExecutor,
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

    const existingId = await matchExistingEntryId(subjectId, level, pack, newTargetPhrase.text, db);

    if (existingId) {
      finalTargetIds.push(existingId);
      continue;
    }

    const id = newId("pbentry");

    await createPhraseBankEntry(
      {
        id,
        subjectId,
        level,
        pack,
        phraseText: newTargetPhrase.text,
        category: newTargetPhrase.category,
      },
      db,
    );

    finalTargetIds.push(id);
  }

  return finalTargetIds;
}
