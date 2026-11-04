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

const dbName = `knowledge_bit_phrase_options_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const DATABASE_URL = dbUrl.toString();

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

const { approveKnowledgeBit, listPendingKnowledgeBitsForReview } = await import("./knowledge-bit-approval.repo.js");
const { approveKnowledgeBitsBulk } = await import("./knowledge-bit-bulk-approval.repo.js");
const { triageKnowledgeBit } = await import("./knowledge-bit-triage.repo.js");
const { undoTriageKnowledgeBit } = await import("./knowledge-bit-triage-undo.repo.js");

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

async function seedBit(kind: "phrase" | "prose", variantCount: number) {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;
  const variantIds: string[] = [];

  await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, $2, 'Phrase: touch base', 'pending')`, [
    sourceId,
    kind,
  ]);
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'touch base', 'pending')`,
    [bitId, sourceId],
  );

  for (let order = 0; order < variantCount; order += 1) {
    const id = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       VALUES ($1, $2, 'basic', $3, 'In a meeting you want to reconnect.', $4)`,
      [id, bitId, order, `Sentence ${order}`],
    );
    variantIds.push(id);
  }

  return { bitId, variantIds };
}

async function activeVariantIds(bitId: string): Promise<string[]> {
  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1 AND superseded_at IS NULL ORDER BY "order"`,
    [bitId],
  );

  return rows.map((row) => row.id as string);
}

describe("phrase sentence options (real Postgres)", () => {
  it("should approve exactly the chosen sentence and drop the other two", async () => {
    const { bitId, variantIds } = await seedBit("phrase", 3);

    const result = await triageKnowledgeBit(bitId, [variantIds[1]!]);

    expect(result).toEqual({ ok: true, droppedVariantIds: expect.arrayContaining([variantIds[0], variantIds[2]]) });
    expect(await activeVariantIds(bitId)).toEqual([variantIds[1]]);
  });

  it("should restore all three sentences on undo", async () => {
    const { bitId, variantIds } = await seedBit("phrase", 3);
    const result = await triageKnowledgeBit(bitId, [variantIds[2]!]);
    const dropped = result !== "not_found" && typeof result === "object" ? result.droppedVariantIds : [];

    expect(await undoTriageKnowledgeBit(bitId, dropped)).toBe(true);
    expect((await activeVariantIds(bitId)).sort()).toEqual([...variantIds].sort());
  });

  it("should keep only the first sentence when a phrase card is approved without a choice", async () => {
    const { bitId, variantIds } = await seedBit("phrase", 3);

    expect(await approveKnowledgeBit(bitId)).toBe(true);
    expect(await activeVariantIds(bitId)).toEqual([variantIds[0]]);
  });

  it("should keep every card when an ordinary card with several variants is approved", async () => {
    const { bitId, variantIds } = await seedBit("prose", 3);

    expect(await approveKnowledgeBit(bitId)).toBe(true);
    expect(await activeVariantIds(bitId)).toEqual(variantIds);
  });

  it("should not bulk-approve phrase cards", async () => {
    const phrase = await seedBit("phrase", 3);
    const ordinary = await seedBit("prose", 1);

    const result = await approveKnowledgeBitsBulk([phrase.bitId, ordinary.bitId]);

    expect(result.approved).toEqual([ordinary.bitId]);
    expect(result.skipped).toEqual([{ id: phrase.bitId, reason: "needs_manual_review" }]);
  });

  it("should mark a phrase card with 3 sentences as a choice and an ordinary or single-sentence card as not", async () => {
    const choice = await seedBit("phrase", 3);
    const single = await seedBit("phrase", 1);
    const ordinary = await seedBit("prose", 3);

    const sources = await listPendingKnowledgeBitsForReview(500);
    const bits = sources.flatMap((source) => source.bits);
    const flag = (id: string) => bits.find((bit) => bit.id === id)?.answerChoice;

    expect(flag(choice.bitId)).toBe(true);
    expect(flag(single.bitId)).toBeFalsy();
    expect(flag(ordinary.bitId)).toBeFalsy();
  });
});
