import { and, eq, sql } from "drizzle-orm";
import type { CardSubjectSuggestionStatus, ResolveCardSubjectSuggestionInput } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { cardSubjectSuggestions, curricula, knowledgeBits, knowledgeSources, subjects, topics } from "../db/schema.js";
import { effectiveSubjectIdSql } from "../knowledge-bit/knowledge-bit-subject.js";

export type ResolveCardSubjectSuggestionResult =
  | { status: CardSubjectSuggestionStatus }
  | { error: "not_found" | "already_resolved" | "subject_not_found" | "already_placed" };

export async function resolveCardSubjectSuggestion(
  suggestionId: string,
  input: ResolveCardSubjectSuggestionInput,
): Promise<ResolveCardSubjectSuggestionResult> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`card-subject-suggestion:${suggestionId}`})::bigint)`,
    );

    const [row] = await tx
      .select()
      .from(cardSubjectSuggestions)
      .where(eq(cardSubjectSuggestions.id, suggestionId))
      .limit(1);

    if (!row) {
      return { error: "not_found" as const };
    }

    if (row.status !== "pending" || row.suggestedSubjectId === null) {
      return { error: "already_resolved" as const };
    }

    if (input.action === "reject") {
      await tx
        .update(cardSubjectSuggestions)
        .set({ status: "rejected", resolvedAt: new Date() })
        .where(eq(cardSubjectSuggestions.id, suggestionId));

      return { status: "rejected" as const };
    }

    const [subject] = await tx
      .select({ id: subjects.id })
      .from(subjects)
      .where(eq(subjects.id, row.suggestedSubjectId))
      .limit(1);

    if (!subject) {
      return { error: "subject_not_found" as const };
    }

    const [placement] = await tx
      .select({ subjectId: effectiveSubjectIdSql })
      .from(knowledgeBits)
      .leftJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
      .leftJoin(topics, eq(topics.id, knowledgeBits.topicId))
      .leftJoin(curricula, eq(curricula.id, topics.curriculumId))
      .where(eq(knowledgeBits.id, row.knowledgeBitId))
      .limit(1);

    if (!placement || placement.subjectId !== null) {
      return { error: "already_placed" as const };
    }

    await tx
      .update(knowledgeSources)
      .set({ subjectId: row.suggestedSubjectId })
      .where(eq(knowledgeSources.id, row.knowledgeSourceId));

    const now = new Date();

    await tx
      .update(cardSubjectSuggestions)
      .set({ status: "approved", resolvedAt: now })
      .where(eq(cardSubjectSuggestions.id, suggestionId));
    await tx
      .update(cardSubjectSuggestions)
      .set({ status: "superseded", resolvedAt: now })
      .where(
        and(
          eq(cardSubjectSuggestions.knowledgeSourceId, row.knowledgeSourceId),
          eq(cardSubjectSuggestions.status, "pending"),
        ),
      );

    return { status: "approved" as const };
  });
}
