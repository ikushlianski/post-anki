import { and, asc, count, desc, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { isOrderedListKind, type InboxKnowledgeBit, type InboxNoteSource } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { loadSubjectPathLabels } from "../subject/subject-path-labels.js";
import { knowledgeBitQuestionVariants, knowledgeBits, knowledgeSources } from "../db/schema.js";

export type InboxTransitionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; reason: "not_found" | "blocked" };

async function lockState(tx: DbExecutor, id: string): Promise<string | null> {
  const row = (
    await tx
      .select({ approvalState: knowledgeBits.approvalState })
      .from(knowledgeBits)
      .where(eq(knowledgeBits.id, id))
      .for("update")
  )[0];

  return row?.approvalState ?? null;
}

export async function countInboxKnowledgeBits(db: DbExecutor = getDb()): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eq(knowledgeBits.approvalState, "inbox"));

  return rows[0]?.value ?? 0;
}

export async function moveKnowledgeBitToInbox(
  id: string,
  db: DbExecutor = getDb(),
): Promise<InboxTransitionResult<number>> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "pending" && state !== "inbox") {
      return { ok: false as const, reason: "blocked" as const };
    }

    if (state === "pending") {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "inbox", inboxAt: new Date() })
        .where(eq(knowledgeBits.id, id));
    }

    return { ok: true as const, value: await countInboxKnowledgeBits(tx) };
  });
}

export async function returnKnowledgeBitFromInbox(
  id: string,
  db: DbExecutor = getDb(),
): Promise<InboxTransitionResult> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "pending" && state !== "inbox") {
      return { ok: false as const, reason: "blocked" as const };
    }

    if (state === "inbox") {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "pending", inboxAt: null })
        .where(eq(knowledgeBits.id, id));
    }

    return { ok: true as const, value: undefined };
  });
}

export async function discardKnowledgeBitFromInbox(
  id: string,
  db: DbExecutor = getDb(),
): Promise<InboxTransitionResult> {
  return db.transaction(async (tx) => {
    const state = await lockState(tx, id);

    if (state === null) {
      return { ok: false as const, reason: "not_found" as const };
    }

    if (state !== "inbox" && state !== "rejected") {
      return { ok: false as const, reason: "blocked" as const };
    }

    if (state === "inbox") {
      await tx
        .update(knowledgeBits)
        .set({ approvalState: "rejected", topicId: null, inboxAt: null, decidedAt: new Date() })
        .where(eq(knowledgeBits.id, id));
    }

    return { ok: true as const, value: undefined };
  });
}

export async function listInboxKnowledgeBits(
  limit: number,
  db: DbExecutor = getDb(),
): Promise<InboxKnowledgeBit[]> {
  const rows = await db
    .select({
      id: knowledgeBits.id,
      body: knowledgeBits.body,
      background: knowledgeBits.background,
      exampleAiGeneratedAt: knowledgeBits.exampleAiGeneratedAt,
      origin: knowledgeBits.origin,
      subjectId: knowledgeSources.subjectId,
      inboxAt: knowledgeBits.inboxAt,
      createdAt: knowledgeBits.createdAt,
    })
    .from(knowledgeBits)
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(eq(knowledgeBits.approvalState, "inbox"))
    .orderBy(desc(knowledgeBits.inboxAt), desc(knowledgeBits.id))
    .limit(limit);

  if (rows.length === 0) {
    return [];
  }

  const cardRows = await db
    .select({ bitId: knowledgeBitQuestionVariants.knowledgeBitId, value: count() })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        isNull(knowledgeBitQuestionVariants.supersededAt),
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .groupBy(knowledgeBitQuestionVariants.knowledgeBitId);
  const pathLabels = await loadSubjectPathLabels(db);
  const cardCounts = new Map(cardRows.map((row) => [row.bitId, row.value]));
  const noteRows = await db
    .select({
      bitId: knowledgeBitQuestionVariants.knowledgeBitId,
      id: knowledgeBitQuestionVariants.id,
      kind: knowledgeBitQuestionVariants.kind,
      sentence: knowledgeBitQuestionVariants.sentence,
    })
    .from(knowledgeBitQuestionVariants)
    .where(
      and(
        isNull(knowledgeBitQuestionVariants.supersededAt),
        isNotNull(knowledgeBitQuestionVariants.sentence),
        inArray(
          knowledgeBitQuestionVariants.knowledgeBitId,
          rows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(knowledgeBitQuestionVariants.order));
  const notes = new Map<string, InboxNoteSource>();

  for (const note of noteRows) {
    const mode = note.kind === "cloze" ? "cloze" : isOrderedListKind(note.kind) ? "list" : null;

    if (mode && note.sentence && !notes.has(note.bitId)) {
      notes.set(note.bitId, { variantId: note.id, mode, text: note.sentence });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    background: row.background,
    exampleAiGeneratedAt: row.exampleAiGeneratedAt?.toISOString() ?? null,
    origin: row.origin ?? "extracted",
    subjectName: row.subjectId ? (pathLabels.get(row.subjectId) ?? null) : null,
    cardCount: cardCounts.get(row.id) ?? 0,
    inboxAt: (row.inboxAt ?? row.createdAt).toISOString(),
    note: notes.get(row.id) ?? null,
  }));
}
