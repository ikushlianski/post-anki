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

const dbName = `model_comparison_${randomUUID().replace(/-/g, "_")}`;
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

const {
  getComparisonRun,
  gradeComparisonCard,
  gradeModelResult,
  listComparisonRuns,
  loadComparisonEvidenceRows,
  saveComparisonRun,
} = await import("./model-comparison.repo.js");

const HAIKU = "openrouter/anthropic/claude-haiku-5.5";
const LUNA = "openrouter/openai/gpt-6-luna";

function card(question: string) {
  return { statement: "s", question, answer: "a", kind: "basic", quote: "q" };
}

function result(modelId: string, questions: string[], overrides: Record<string, unknown> = {}) {
  return {
    modelId,
    status: "ok" as const,
    ms: 1200,
    returned: questions.length + 1,
    cards: questions.map(card),
    dropped: ["bad_card"],
    error: null,
    inputTokens: 2410 as number | null,
    outputTokens: 930 as number | null,
    actualCostUsd: 0.000715 as number | null,
    ...overrides,
  };
}

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
}, 30_000);

async function saveRun(runId: string, excerpt = "Redis хранит данные в памяти.") {
  await saveComparisonRun({
    runId,
    excerpt,
    modelIds: [LUNA, HAIKU],
    estimatedCostUsd: 0.0123,
    perModelEstimatedCostUsd: { [HAIKU]: 0.0008, [LUNA]: 0.0007 },
    results: [result(HAIKU, ["Где Redis хранит данные?", "Почему чтение быстрое?"]), result(LUNA, ["Что хранит Redis?"])],
  });
}

describe("model comparison repo", () => {
  it("should store a run and return its results in the order the models were chosen with no grades", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    const run = await getComparisonRun(runId);

    expect(run?.estimatedCostUsd).toBeCloseTo(0.0123, 6);
    expect(run?.results.map((entry) => entry.modelId)).toEqual([LUNA, HAIKU]);
    expect(run?.results[1]).toMatchObject({
      status: "ok",
      returned: 3,
      dropped: ["bad_card"],
      extractionRating: null,
      cardGrades: [],
    });
    expect(run?.results[1]?.cards.map((entry) => entry.question)).toEqual(["Где Redis хранит данные?", "Почему чтение быстрое?"]);
  });

  it("should store the actual tokens and cost beside the per-model estimate and read them back as numbers", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    const stored = (await getComparisonRun(runId))?.results[1];

    expect(stored).toMatchObject({ inputTokens: 2410, outputTokens: 930 });
    expect(stored?.actualCostUsd).toBeCloseTo(0.000715, 6);
    expect(stored?.estimatedCostUsd).toBeCloseTo(0.0008, 6);
  });

  it("should keep unreported usage as null and never turn it into zero", async () => {
    const runId = randomUUID();

    await saveComparisonRun({
      runId,
      excerpt: "text",
      modelIds: [HAIKU],
      estimatedCostUsd: 0.001,
      results: [result(HAIKU, ["Q?"], { inputTokens: null, outputTokens: null, actualCostUsd: null })],
    });

    expect((await getComparisonRun(runId))?.results[0]).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      actualCostUsd: null,
      estimatedCostUsd: null,
    });
  });

  it("should return null for a run that does not exist", async () => {
    expect(await getComparisonRun(randomUUID())).toBeNull();
  });

  it("should list the newest runs first with a 120 character excerpt preview", async () => {
    const older = randomUUID();
    const newer = randomUUID();

    await saveRun(older, "а".repeat(500));
    await saveRun(newer, "б".repeat(500));

    const list = await listComparisonRuns(20);
    const ids = list.map((entry) => entry.runId);

    expect(ids.indexOf(newer)).toBeLessThan(ids.indexOf(older));
    expect(list.find((entry) => entry.runId === newer)?.excerptPreview).toHaveLength(120);
  });

  it("should keep a model failure as a stored result with its error", async () => {
    const runId = randomUUID();

    await saveComparisonRun({
      runId,
      excerpt: "text",
      modelIds: [HAIKU],
      estimatedCostUsd: 0,
      results: [result(HAIKU, [], { status: "failed", returned: 0, dropped: [], error: "provider timeout" })],
    });

    expect((await getComparisonRun(runId))?.results[0]).toMatchObject({ status: "failed", error: "provider timeout", cards: [] });
  });

  it("should save an extraction grade and note, change them later, and clear the note", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    expect(await gradeModelResult(runId, HAIKU, { extractionRating: 4, note: "missed the hedge" })).toBe("ok");
    expect(await gradeModelResult(runId, HAIKU, { extractionRating: 2 })).toBe("ok");
    expect((await getComparisonRun(runId))?.results[1]).toMatchObject({ extractionRating: 2, extractionNote: "missed the hedge" });

    await gradeModelResult(runId, HAIKU, { note: null });

    expect((await getComparisonRun(runId))?.results[1]?.extractionNote).toBeNull();
  });

  it("should report not found when grading a model that was not part of the run", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    expect(await gradeModelResult(runId, "openrouter/openai/gpt-4o-mini", { extractionRating: 3 })).toBe("not_found");
  });

  it("should keep one row per card and merge card quality and wording grades given separately", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    await gradeComparisonCard(runId, HAIKU, 0, { rating: 5 });
    await gradeComparisonCard(runId, HAIKU, 0, { wordingRating: 2 });
    await gradeComparisonCard(runId, HAIKU, 0, { rating: 4 });

    const rows = await client.query(`select rating, wording_rating from model_comparison_card_grade where run_id = $1`, [runId]);

    expect(rows.rows).toEqual([{ rating: 4, wording_rating: 2 }]);
    expect((await getComparisonRun(runId))?.results[1]?.cardGrades).toEqual([{ cardIndex: 0, rating: 4, wordingRating: 2 }]);
  });

  it("should refuse to grade a card position the model did not return", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    expect(await gradeComparisonCard(runId, LUNA, 1, { rating: 3 })).toBe("not_found");
    expect(await gradeComparisonCard(runId, LUNA, -1, { rating: 3 })).toBe("not_found");
  });

  it("should reject a grade outside 1 to 5 at the database level", async () => {
    const runId = randomUUID();

    await saveRun(runId);

    await expect(
      client.query(`update model_comparison_result set extraction_rating = 6 where run_id = $1`, [runId]),
    ).rejects.toThrow(/model_comparison_result_rating_range/);
  });

  it("should count only graded results as evidence, averaging the per-run card averages", async () => {
    const runA = randomUUID();
    const runB = randomUUID();
    const runC = randomUUID();

    await client.query(`delete from model_comparison_card_grade`);
    await client.query(`delete from model_comparison_result`);
    await client.query(`delete from model_comparison_run`);
    await saveRun(runA);
    await saveRun(runB);
    await saveRun(runC);

    await gradeModelResult(runA, HAIKU, { extractionRating: 5 });
    await gradeComparisonCard(runA, HAIKU, 0, { rating: 5, wordingRating: 4 });
    await gradeComparisonCard(runA, HAIKU, 1, { rating: 3, wordingRating: 4 });
    await gradeModelResult(runB, HAIKU, { extractionRating: 3 });
    await gradeComparisonCard(runB, HAIKU, 0, { rating: 2, wordingRating: 2 });
    await gradeComparisonCard(runC, HAIKU, 0, { rating: 1, wordingRating: 1 });

    const rows = await loadComparisonEvidenceRows();

    expect(rows).toEqual([
      { modelId: HAIKU, gradedRuns: 2, extractionAverage: 4, cardAverage: 3, wordingAverage: 3 },
    ]);
  });

  it("should expose a readable report row per model result with averages", async () => {
    const runId = randomUUID();

    await saveRun(runId);
    await gradeModelResult(runId, LUNA, { extractionRating: 4, note: "ok" });
    await gradeComparisonCard(runId, LUNA, 0, { rating: 5, wordingRating: 3 });

    const report = await client.query(
      `select model_id, extraction_rating, extraction_note, average_card_quality, average_question_wording, cards_kept, cards_returned, ms, input_tokens, output_tokens, actual_cost_usd::float8 as actual_cost_usd, estimated_cost_usd::float8 as estimated_cost_usd from model_comparison_report where run_id = $1 and model_id = $2`,
      [runId, LUNA],
    );

    expect(report.rows).toEqual([
      {
        model_id: LUNA,
        extraction_rating: 4,
        extraction_note: "ok",
        average_card_quality: 5,
        average_question_wording: 3,
        cards_kept: 1,
        cards_returned: 2,
        ms: 1200,
        input_tokens: 2410,
        output_tokens: 930,
        actual_cost_usd: 0.000715,
        estimated_cost_usd: 0.0007,
      },
    ]);
  });

  it("should run the documented example queries against the report view and tables", async () => {
    const runId = randomUUID();

    await saveRun(runId);
    await gradeModelResult(runId, HAIKU, { extractionRating: 4, note: "fine" });

    const perModel = await client.query(
      `select model_id,
              count(*) filter (where extraction_rating is not null) as graded_runs,
              round(avg(extraction_rating), 2) as extraction,
              round(avg(average_card_quality)::numeric, 2) as card_quality,
              round(avg(average_question_wording)::numeric, 2) as wording
       from model_comparison_report
       group by model_id
       order by extraction desc nulls last`,
    );
    const notes = await client.query(
      `select created_at, model_id, extraction_rating, extraction_note
       from model_comparison_report
       where extraction_note is not null
       order by created_at desc`,
    );
    const failed = await client.query(
      `select r.created_at, res.model_id, res.error
       from model_comparison_result res
       join model_comparison_run r on r.id = res.run_id
       where res.status = 'failed'
       order by r.created_at desc`,
    );

    const estimateVersusActual = await client.query(
      `select model_id,
              round(avg(estimated_cost_usd), 6) as avg_estimate,
              round(avg(actual_cost_usd), 6) as avg_actual,
              round(avg(actual_cost_usd) / nullif(avg(estimated_cost_usd), 0), 2) as actual_over_estimate
       from model_comparison_report
       where actual_cost_usd is not null and estimated_cost_usd is not null
       group by model_id
       order by actual_over_estimate desc`,
    );

    expect(estimateVersusActual.rows.length).toBeGreaterThan(0);
    expect(perModel.rows.length).toBeGreaterThan(0);
    expect(notes.rows.some((row) => row.extraction_note === "fine")).toBe(true);
    expect(Array.isArray(failed.rows)).toBe(true);
  });
});
