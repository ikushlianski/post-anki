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

const dbName = `knowledge_bit_fill_blank_mark_${randomUUID().replace(/-/g, "_")}`;
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

const { insertQuestionVariant } = await import("./knowledge-bit-question-variant.repo.js");
const {
  markFillBlankGenerated,
  markFillBlankGenerationFailed,
  recordGeneratedFillBlankVariant,
  claimKnowledgeBitForFillBlankGeneration,
  FillBlankGenerationClaimLostError,
} = await import("./knowledge-bit-fill-blank-claim.repo.js");
const { recordGeneratedQuestionVariant, claimKnowledgeBitForWhQuestionGeneration } =
  await import("./knowledge-bit-wh-question-claim.repo.js");

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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );
  return id;
}

async function seedKnowledgeBit(knowledgeSourceId: string, ordinal: number, body: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body) VALUES ($1, $2, $3, $4)`,
    [id, knowledgeSourceId, ordinal, body],
  );

  return id;
}

describe("markFillBlankGenerated / markFillBlankGenerationFailed (real Postgres)", () => {
  it("persists fillBlankGeneratedAt on read-back after marking a bit generated", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to mark generated");
    const claimToken = await claimKnowledgeBitForFillBlankGeneration(id);

    await markFillBlankGenerated(id, claimToken as string);

    const { rows } = await client.query(
      `SELECT fill_blank_generated_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generated_at).toBeInstanceOf(Date);
  });

  it("persists fillBlankGenerationFailedAt on read-back after marking a bit failed", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to mark failed");
    const claimToken = await claimKnowledgeBitForFillBlankGeneration(id);

    await markFillBlankGenerationFailed(id, claimToken as string);

    const { rows } = await client.query(
      `SELECT fill_blank_generation_failed_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generation_failed_at).toBeInstanceOf(Date);
  });

  it("increments fillBlankGenerationAttempts and clears the claim on each failure", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to fail twice");

    const firstClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;
    await markFillBlankGenerationFailed(id, firstClaim);
    const secondClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;
    await markFillBlankGenerationFailed(id, secondClaim);

    const { rows } = await client.query(
      `SELECT fill_blank_generation_attempts, fill_blank_generation_claimed_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generation_attempts).toBe(2);
    expect(rows[0]!.fill_blank_generation_claimed_at).toBeNull();
  });

  it("clears the claim on success without touching attempts or failedAt", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit that fails then succeeds");

    const firstClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;
    await markFillBlankGenerationFailed(id, firstClaim);
    const secondClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;
    await markFillBlankGenerated(id, secondClaim);

    const { rows } = await client.query(
      `SELECT fill_blank_generation_attempts, fill_blank_generation_claimed_at, fill_blank_generated_at
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generation_attempts).toBe(1);
    expect(rows[0]!.fill_blank_generation_claimed_at).toBeNull();
    expect(rows[0]!.fill_blank_generated_at).toBeInstanceOf(Date);
  });

  it("never lets a stale scan's failure write clobber a bit a concurrent winner already generated", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit two scans race to finish");

    const scanAClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;

    await client.query(
      `UPDATE knowledge_bits SET fill_blank_generation_claimed_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 60 * 60 * 1000), id],
    );
    const scanBClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;
    await recordGeneratedFillBlankVariant(id, "fill_in_the_blank", 0, "This ____ matters.", "fact", scanBClaim);

    await expect(markFillBlankGenerationFailed(id, scanAClaim)).rejects.toThrow(
      FillBlankGenerationClaimLostError,
    );

    const { rows } = await client.query(
      `SELECT fill_blank_generated_at, fill_blank_generation_failed_at, fill_blank_generation_attempts
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generated_at).toBeInstanceOf(Date);
    expect(rows[0]!.fill_blank_generation_failed_at).toBeNull();
    expect(rows[0]!.fill_blank_generation_attempts).toBe(0);
  });

  it("refuses a write once the claim has moved to another scan, even before that scan resolves the bit either way", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit whose claim moves on before either scan resolves it");

    const scanAClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;

    await client.query(
      `UPDATE knowledge_bits SET fill_blank_generation_claimed_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 60 * 60 * 1000), id],
    );
    const scanBClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;

    await expect(markFillBlankGenerationFailed(id, scanAClaim)).rejects.toThrow(
      FillBlankGenerationClaimLostError,
    );

    const { rows } = await client.query(
      `SELECT fill_blank_generation_claim_token, fill_blank_generation_attempts, fill_blank_generation_failed_at
       FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.fill_blank_generation_claim_token).toBe(scanBClaim);
    expect(rows[0]!.fill_blank_generation_attempts).toBe(0);
    expect(rows[0]!.fill_blank_generation_failed_at).toBeNull();
  });

  it("rolls back an insert instead of orphaning a variant row when the claim is lost mid-transaction", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit where the loser's insert finishes first");

    const scanAClaim = (await claimKnowledgeBitForFillBlankGeneration(id)) as string;

    await client.query(
      `UPDATE knowledge_bits SET fill_blank_generation_claimed_at = $1 WHERE id = $2`,
      [new Date(Date.now() - 60 * 60 * 1000), id],
    );
    await claimKnowledgeBitForFillBlankGeneration(id);

    await expect(
      recordGeneratedFillBlankVariant(id, "fill_in_the_blank", 0, "This ____ matters.", "fact", scanAClaim),
    ).rejects.toThrow(FillBlankGenerationClaimLostError);

    const { rows: variantRows } = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [id],
    );
    const { rows: bitRows } = await client.query(
      `SELECT fill_blank_generated_at FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(variantRows).toHaveLength(0);
    expect(bitRows[0]!.fill_blank_generated_at).toBeNull();
  });
});

describe("recordGeneratedFillBlankVariant (real Postgres)", () => {
  it("inserts the variant and stamps fillBlankGeneratedAt in one transaction", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to record a fill-blank for");
    const claimToken = (await claimKnowledgeBitForFillBlankGeneration(bitId)) as string;

    await recordGeneratedFillBlankVariant(
      bitId,
      "fill_in_the_blank",
      0,
      "This ____ matters.",
      "fact",
      claimToken,
    );

    const { rows: variantRows } = await client.query(
      `SELECT knowledge_bit_id, kind, "order" FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [bitId],
    );
    const { rows: bitRows } = await client.query(
      `SELECT fill_blank_generated_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(variantRows).toHaveLength(1);
    expect(bitRows[0]!.fill_blank_generated_at).toBeInstanceOf(Date);
  });

  it("rejects a second fill_in_the_blank variant for the same bit and slot via the unique index", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit that already has a fill-blank variant");

    await insertQuestionVariant(bitId, "fill_in_the_blank", 0, "First ____ sentence.", "prompt");

    await expect(
      insertQuestionVariant(bitId, "fill_in_the_blank", 0, "Second ____ sentence.", "prompt"),
    ).rejects.toThrow();
  });

  it("allows a wh_question row and a fill_in_the_blank row to coexist for the same bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit that gets both variant kinds");
    const claimToken = (await claimKnowledgeBitForFillBlankGeneration(bitId)) as string;
    const whClaimToken = (await claimKnowledgeBitForWhQuestionGeneration(bitId)) as string;

    await recordGeneratedQuestionVariant(bitId, "wh_question", 0, "Why?", "Because.", whClaimToken);
    await recordGeneratedFillBlankVariant(bitId, "fill_in_the_blank", 0, "This ____ matters.", "fact", claimToken);

    const { rows } = await client.query(
      `SELECT kind FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 ORDER BY kind`,
      [bitId],
    );

    expect(rows.map((row) => row.kind)).toEqual(["fill_in_the_blank", "wh_question"]);
  });
});
