import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources, subjects } from "../db/schema.js";
import { getTriageEnabled } from "../admin-settings/admin-settings.repo.js";
import { cardTextKey } from "../knowledge-bit/knowledge-bit-card-text-key.js";
import { findExistingCardKeys } from "../knowledge-bit/knowledge-bit-duplicate-gate.js";
import { initialBitState } from "../knowledge-bit/knowledge-bit-initial-state.js";
import { newId } from "../shared/id.js";
import type { VerbatimCard } from "./anki-verbatim-parse.js";

const SOURCE_TEXT = "Cards imported verbatim from an Anki export";

export type SubjectLookup =
  | { ok: true; subjectId: string }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "ambiguous"; matches: { id: string; name: string }[] };

export type VerbatimImportOutcome = {
  approvalState: "pending" | "approved";
  alreadyPresent: number;
  inserted: number;
};

export async function findTopLevelSubject(db: DbExecutor, name: string): Promise<SubjectLookup> {
  const matches = await db
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(and(isNull(subjects.parentId), sql`lower(${subjects.name}) = lower(${name})`));

  const [only] = matches;

  if (!only) return { ok: false, reason: "not_found" };

  if (matches.length > 1) return { ok: false, reason: "ambiguous", matches };

  return { ok: true, subjectId: only.id };
}

async function getOrCreateSource(db: DbExecutor, subjectId: string): Promise<string> {
  const importKey = `anki-verbatim:${subjectId}`;

  await db
    .insert(knowledgeSources)
    .values({ id: newId("ks"), kind: "prose", rawText: SOURCE_TEXT, status: "bits_detected", subjectId, importKey })
    .onConflictDoNothing({ target: knowledgeSources.importKey });

  const [source] = await db
    .select({ id: knowledgeSources.id })
    .from(knowledgeSources)
    .where(eq(knowledgeSources.importKey, importKey));

  if (!source) throw new Error("import source missing after insert");

  return source.id;
}

async function nextOrdinal(db: DbExecutor, sourceId: string): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${knowledgeBits.ordinal}), -1) + 1` })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.knowledgeSourceId, sourceId));

  return Number(row?.next ?? 0);
}

async function insertChunk(
  db: DbExecutor,
  sourceId: string,
  startOrdinal: number,
  cards: VerbatimCard[],
  state: ReturnType<typeof initialBitState>,
): Promise<void> {
  const stampedAt = new Date();
  const bitRows = cards.map((card, index) => ({
    id: newId("kb"),
    knowledgeSourceId: sourceId,
    ordinal: startOrdinal + index,
    body: `${card.front}\n${card.back}`,
    background: card.example,
    ...state,
    origin: "manual" as const,
    isAiGenerated: false,
    whQuestionGeneratedAt: stampedAt,
    fillBlankGeneratedAt: stampedAt,
    basicCardGeneratedAt: stampedAt,
  }));

  await db.insert(knowledgeBits).values(bitRows);
  await db.insert(knowledgeBitQuestionVariants).values(
    cards.map((card, index) => ({
      id: newId("kbqv"),
      knowledgeBitId: (bitRows[index] as { id: string }).id,
      kind: "basic",
      order: 0,
      prompt: card.front,
      answer: card.back,
      cardKey: cardTextKey(card.front, card.back),
    })),
  );
}

export async function importVerbatimCards(
  db: DbExecutor,
  subjectId: string,
  cards: VerbatimCard[],
  chunkSize = 500,
): Promise<VerbatimImportOutcome> {
  const state = initialBitState(await getTriageEnabled(db));
  const outcome: VerbatimImportOutcome = { approvalState: state.approvalState, alreadyPresent: 0, inserted: 0 };

  for (let start = 0; start < cards.length; start += chunkSize) {
    const chunk = cards.slice(start, start + chunkSize);

    await db.transaction(async (tx) => {
      const existing = await findExistingCardKeys(
        tx,
        chunk.map((card) => cardTextKey(card.front, card.back)),
      );
      const fresh = chunk.filter((card) => !existing.has(cardTextKey(card.front, card.back)));

      outcome.alreadyPresent += chunk.length - fresh.length;

      if (fresh.length === 0) return;

      const sourceId = await getOrCreateSource(tx, subjectId);

      await insertChunk(tx, sourceId, await nextOrdinal(tx, sourceId), fresh, state);
      outcome.inserted += fresh.length;
    });
  }

  return outcome;
}
