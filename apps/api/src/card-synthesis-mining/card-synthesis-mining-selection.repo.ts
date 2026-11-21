import { and, asc, eq, inArray, isNotNull, notExists } from "drizzle-orm";
import { getDb } from "../db/client.js";
import {
  knowledgeBits,
  knowledgeSources,
  subjects,
  synthesisMiningExaminedBits,
} from "../db/schema.js";

export interface MiningCandidateBit {
  id: string;
  body: string;
  createdAt: Date;
  embedding: number[];
}

export interface SubjectNode {
  id: string;
  parentId: string | null;
}

export interface MiningSelectionStore {
  listSubjects(): Promise<SubjectNode[]>;
  listUnexaminedEmbeddedBits(subjectIds: string[], limit: number): Promise<MiningCandidateBit[]>;
}

export const miningSelectionStore: MiningSelectionStore = {
  async listSubjects() {
    return getDb().select({ id: subjects.id, parentId: subjects.parentId }).from(subjects);
  },

  async listUnexaminedEmbeddedBits(subjectIds, limit) {
    if (subjectIds.length === 0 || limit <= 0) {
      return [];
    }

    const db = getDb();
    const rows = await db
      .select({
        id: knowledgeBits.id,
        body: knowledgeBits.body,
        createdAt: knowledgeBits.createdAt,
        embedding: knowledgeBits.embeddingVec,
      })
      .from(knowledgeBits)
      .where(
        and(
          eq(knowledgeBits.approvalState, "approved"),
          isNotNull(knowledgeBits.embeddingVec),
          inArray(
            knowledgeBits.knowledgeSourceId,
            db
              .select({ id: knowledgeSources.id })
              .from(knowledgeSources)
              .where(inArray(knowledgeSources.subjectId, subjectIds)),
          ),
          notExists(
            db
              .select({ id: synthesisMiningExaminedBits.id })
              .from(synthesisMiningExaminedBits)
              .where(eq(synthesisMiningExaminedBits.bitId, knowledgeBits.id)),
          ),
        ),
      )
      .orderBy(asc(knowledgeBits.createdAt), asc(knowledgeBits.id))
      .limit(limit);

    return rows.flatMap((row) =>
      row.embedding === null ? [] : [{ ...row, embedding: row.embedding }],
    );
  },
};
