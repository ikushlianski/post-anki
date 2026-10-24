import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `knowledge_bit_origin_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { approveKnowledgeBit, rejectKnowledgeBit } = await import("./knowledge-bit-approval.repo.js");
const { approveKnowledgeBitsBulk } = await import("./knowledge-bit-bulk-approval.repo.js");
const { upsertSourceExtractionGrade } = await import("../knowledge-source/knowledge-source-extraction-grade.repo.js");
const { saveComparisonRun, gradeModelResult, loadComparisonEvidenceRows } = await import(
  "../model-comparison/model-comparison.repo.js"
);
const {
  aggregateFeedbackByModel,
  loadRecentFeedbackForExtraction,
  loadModelEvidenceRows,
  upsertKnowledgeBitGrades,
} = await import("./knowledge-bit-feedback.repo.js");
const { GradesNotApplicableError } = await import("./knowledge-bit-feedback-exclusion.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

async function seedSource(subjectId: string | null, modelId: string | null): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, extraction_model_id)
     VALUES ($1, 'prose', 'text', 'bits_detected', $2, $3)`,
    [id, subjectId, modelId],
  );

  return id;
}

let nextOrdinal = 0;

async function seedBit(sourceId: string, body: string, origin: "extracted" | "manual"): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [id, sourceId, nextOrdinal++, body, origin],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'basic', 0, 'Front?', 'Back.')`,
    [`kbqv_${randomUUID()}`, id],
  );

  return id;
}

async function seedFeedback(input: {
  sourceId: string;
  bitId: string;
  subjectId: string | null;
  modelId: string;
  verdict: "approved" | "rejected";
  statement: string;
  rating?: number;
  createdAt?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_feedback
       (id, knowledge_source_id, knowledge_bit_id, subject_id, model_id, extraction_run, verdict, statement, rating, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
    [
      `kbf_${randomUUID()}`,
      input.sourceId,
      input.bitId,
      input.subjectId,
      input.modelId,
      input.verdict,
      input.statement,
      input.rating ?? null,
      input.createdAt ?? null,
    ],
  );
}

async function feedbackCount(bitId: string): Promise<number> {
  const { rows } = await client.query(`SELECT 1 FROM knowledge_bit_feedback WHERE knowledge_bit_id = $1`, [bitId]);

  return rows.length;
}

const LATER = "2999-01-01T00:00:00Z";

describe("manual knowledge items stay out of model feedback (real Postgres)", () => {
  it("should write no feedback row when a manual item is approved, rejected or bulk approved", async () => {
    const sourceId = await seedSource(null, "m/origin-decisions");
    const approvedId = await seedBit(sourceId, "Manual approved", "manual");
    const rejectedId = await seedBit(sourceId, "Manual rejected", "manual");
    const bulkId = await seedBit(sourceId, "Manual bulk", "manual");

    expect(await approveKnowledgeBit(approvedId)).toBe(true);
    expect(await rejectKnowledgeBit(rejectedId)).toEqual({ ok: true, feedbackId: null });
    expect((await approveKnowledgeBitsBulk([bulkId])).approved).toEqual([bulkId]);

    expect(await feedbackCount(approvedId)).toBe(0);
    expect(await feedbackCount(rejectedId)).toBe(0);
    expect(await feedbackCount(bulkId)).toBe(0);

    const extractedId = await seedBit(sourceId, "Extracted approved", "extracted");

    expect(await approveKnowledgeBit(extractedId)).toBe(true);
    expect(await feedbackCount(extractedId)).toBe(1);
  });

  it("should refuse grades for a manual item and keep grading extracted items", async () => {
    const sourceId = await seedSource(null, "m/origin-grades");
    const manualId = await seedBit(sourceId, "Manual graded", "manual");
    const extractedId = await seedBit(sourceId, "Extracted graded", "extracted");

    await expect(upsertKnowledgeBitGrades(manualId, { rating: 4 })).rejects.toBeInstanceOf(
      GradesNotApplicableError,
    );
    expect(await feedbackCount(manualId)).toBe(0);

    const graded = await upsertKnowledgeBitGrades(extractedId, { rating: 4 });

    expect(graded).toMatchObject({ rating: 4, feedbackId: expect.any(String) });
  });

  it("should exclude manual feedback from by-model counts", async () => {
    const modelId = `m/by-model-${randomUUID()}`;
    const onlyManualModel = `m/manual-only-${randomUUID()}`;
    const sourceId = await seedSource(null, modelId);
    const extractedId = await seedBit(sourceId, "Extracted", "extracted");
    const manualId = await seedBit(sourceId, "Manual", "manual");

    await seedFeedback({ sourceId, bitId: extractedId, subjectId: null, modelId, verdict: "approved", statement: "E" });
    await seedFeedback({ sourceId, bitId: manualId, subjectId: null, modelId, verdict: "rejected", statement: "M" });
    await seedFeedback({
      sourceId,
      bitId: manualId,
      subjectId: null,
      modelId: onlyManualModel,
      verdict: "approved",
      statement: "M2",
    });

    const { models } = await aggregateFeedbackByModel();

    expect(models.find((model) => model.modelId === modelId)).toMatchObject({ approved: 1, rejected: 0 });
    expect(models.find((model) => model.modelId === onlyManualModel)).toBeUndefined();
  });

  it("should exclude manual feedback from default-model evidence", async () => {
    const modelId = `m/evidence-${randomUUID()}`;
    const sourceId = await seedSource(null, modelId);
    const extractedId = await seedBit(sourceId, "Extracted", "extracted");
    const manualId = await seedBit(sourceId, "Manual", "manual");

    await seedFeedback({
      sourceId,
      bitId: extractedId,
      subjectId: null,
      modelId,
      verdict: "approved",
      statement: "E",
      rating: 4,
    });
    await seedFeedback({
      sourceId,
      bitId: manualId,
      subjectId: null,
      modelId,
      verdict: "approved",
      statement: "M",
      rating: 1,
    });

    const { decisions } = await loadModelEvidenceRows();

    expect(decisions.find((row) => row.modelId === modelId)).toMatchObject({
      approved: 1,
      rejected: 0,
      cardAverage: 4,
    });
  });

  it("should exclude manual feedback from the reviewer memory examples", async () => {
    const subjectId = `sub_origin_${randomUUID()}`;
    const sourceId = await seedSource(subjectId, "m/memory");
    const extractedId = await seedBit(sourceId, "Extracted", "extracted");
    const manualId = await seedBit(sourceId, "Manual", "manual");
    const manualStatement = `Manual statement ${randomUUID()}`;

    await seedFeedback({ sourceId, bitId: extractedId, subjectId, modelId: "m/memory", verdict: "approved", statement: "Extracted statement" });
    await seedFeedback({
      sourceId,
      bitId: manualId,
      subjectId,
      modelId: "m/memory",
      verdict: "approved",
      statement: manualStatement,
      createdAt: LATER,
    });
    await upsertSourceExtractionGrade(sourceId, { rating: 3 });

    const scoped = await loadRecentFeedbackForExtraction(subjectId);
    const global = await loadRecentFeedbackForExtraction(null);

    expect(scoped.recent.map((row) => row.statement)).toEqual(["Extracted statement"]);
    expect(scoped.approved.map((row) => row.statement)).toEqual(["Extracted statement"]);
    expect(scoped.extractionGrades).toHaveLength(1);
    expect(global.recent.map((row) => row.statement)).not.toContain(manualStatement);
    expect(global.approved.map((row) => row.statement)).not.toContain(manualStatement);
    expect(global.recent.map((row) => row.statement)).toContain("Extracted statement");
  });

  it("should hide manual items from the feedback report view", async () => {
    const sourceId = await seedSource(null, "m/report");
    const extractedId = await seedBit(sourceId, "Extracted", "extracted");
    const manualId = await seedBit(sourceId, "Manual", "manual");

    await seedFeedback({ sourceId, bitId: extractedId, subjectId: null, modelId: "m/report", verdict: "approved", statement: "E" });
    await seedFeedback({ sourceId, bitId: manualId, subjectId: null, modelId: "m/report", verdict: "approved", statement: "M" });
    await upsertSourceExtractionGrade(sourceId, { rating: 5 });

    const { rows } = await client.query(
      `SELECT knowledge_bit_id, extraction_rating FROM knowledge_feedback_report WHERE knowledge_source_id = $1`,
      [sourceId],
    );

    expect(rows).toEqual([{ knowledge_bit_id: extractedId, extraction_rating: 5 }]);
  });

  it("should leave comparison evidence unchanged by manual items", async () => {
    const runId = `mcrun_${randomUUID()}`;

    await saveComparisonRun({
      runId,
      excerpt: "Excerpt",
      modelIds: ["m/compare"],
      estimatedCostUsd: 0.01,
      results: [
        {
          modelId: "m/compare",
          status: "ok",
          ms: 10,
          returned: 0,
          cards: [],
          dropped: [],
          error: null,
          inputTokens: null,
          outputTokens: null,
          actualCostUsd: null,
        },
      ],
    });
    await gradeModelResult(runId, "m/compare", { extractionRating: 4 });

    const before = await loadComparisonEvidenceRows();
    const sourceId = await seedSource(null, "m/compare");
    const manualId = await seedBit(sourceId, "Manual", "manual");

    await seedFeedback({ sourceId, bitId: manualId, subjectId: null, modelId: "m/compare", verdict: "approved", statement: "M", rating: 1 });

    const after = await loadComparisonEvidenceRows();

    expect(before).toEqual([
      { modelId: "m/compare", gradedRuns: 1, extractionAverage: 4, cardAverage: null, wordingAverage: null },
    ]);
    expect(after).toEqual(before);
  });
});
