import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DbExecutor } from "../db/client.js";

vi.mock("./knowledge-bit-feedback.model-id.js", () => ({
  resolveFeedbackModelId: vi.fn(async (modelId: string | null) => modelId),
  clipText: (value: string | null | undefined) => value ?? null,
}));

const {
  recordKnowledgeBitFeedback,
  aggregateFeedbackByModel,
  loadRecentFeedbackForExtraction,
  loadModelEvidenceRows,
} = await import("./knowledge-bit-feedback.repo.js");

const dialect = new PgDialect();

function fakeDb(results: unknown[][]) {
  const queue = [...results];
  const wheres: Array<SQL | undefined> = [];
  const inserted: unknown[] = [];

  const db = {
    select: () => {
      const rows = queue.shift() ?? [];
      const builder: Record<string, unknown> = {
        where: (clause: SQL | undefined) => {
          wheres.push(clause);

          return builder;
        },
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };

      for (const name of ["from", "orderBy", "limit", "groupBy"]) {
        builder[name] = () => builder;
      }

      return builder;
    },
    insert: () => ({
      values: async (value: unknown) => {
        inserted.push(value);
      },
    }),
  };

  return { db: db as unknown as DbExecutor, wheres, inserted };
}

function renderedWhere(clause: SQL | undefined): string {
  return clause ? dialect.sqlToQuery(clause).sql : "";
}

const MANUAL_PREDICATE = /not exists \(\s*select 1 from "knowledge_bits"[\s\S]*"knowledge_bits"\."origin" = 'manual'/;

describe("manual item feedback eligibility", () => {
  it("should skip the feedback write for a manual item", async () => {
    const { db, inserted } = fakeDb([[{ body: "Mine", origin: "manual", approvalState: "pending", knowledgeSourceId: "ks_1" }]]);

    const id = await recordKnowledgeBitFeedback(db, { bitId: "kb_1", verdict: "approved" });

    expect(id).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("should still write feedback for an extracted item", async () => {
    const { db, inserted } = fakeDb([
      [{ body: "Fact", origin: "extracted", approvalState: "pending", knowledgeSourceId: "ks_1" }],
      [{ subjectId: "sub_1", extractionModelId: "model-a", extractionRun: 2 }],
      [{ prompt: "Q", answer: "A" }],
      [],
    ]);

    const id = await recordKnowledgeBitFeedback(db, { bitId: "kb_1", verdict: "approved" });

    expect(id).toMatch(/^kbf_/);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ knowledgeBitId: "kb_1", verdict: "approved", modelId: "model-a" });
  });
});

describe("manual item feedback exclusion in readers", () => {
  it("should exclude manual items from the reviewer memory examples", async () => {
    const { db, wheres } = fakeDb([[], [], []]);

    await loadRecentFeedbackForExtraction(null, db);

    expect(renderedWhere(wheres[0])).toMatch(MANUAL_PREDICATE);
    expect(renderedWhere(wheres[1])).toMatch(MANUAL_PREDICATE);
  });

  it("should exclude manual items from the by-model counts", async () => {
    const { db, wheres } = fakeDb([[]]);

    await aggregateFeedbackByModel(db);

    expect(renderedWhere(wheres[0])).toMatch(MANUAL_PREDICATE);
  });

  it("should exclude manual items from the default-model evidence", async () => {
    const { db, wheres } = fakeDb([[], []]);

    await loadModelEvidenceRows(db);

    expect(wheres).toHaveLength(1);
    expect(renderedWhere(wheres[0])).toMatch(MANUAL_PREDICATE);
  });
});
