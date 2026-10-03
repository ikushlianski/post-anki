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

const dbName = `tag_mastery_status_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getTagMasteryStatuses, resolveOrCreateTag, assignTag } = await import("./tag.repo.js");
const { insertQuestionVariant } = await import(
  "../knowledge-bit/knowledge-bit-question-variant.repo.js"
);
const { insertVariantAttempt } = await import(
  "../knowledge-bit/knowledge-bit-variant-attempt.repo.js"
);

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedKnowledgeBit(body: string): Promise<string> {
  const sourceId = id("ksrc");
  const bitId = id("kb");

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [sourceId, body],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, 'approved')`,
    [bitId, sourceId, body],
  );

  return bitId;
}

async function seedVariant(bitId: string, prompt: string): Promise<string> {
  await insertQuestionVariant(bitId, "wh_question", 0, prompt, "some answer");

  const { rows } = await client.query(
    `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
    [bitId],
  );

  return rows[0]!.id as string;
}

async function recordAttempt(variantId: string, verdict: "Ok" | "NeedsReview" | "NeedsDeepDive") {
  await insertVariantAttempt({
    variantId,
    userAnswer: "an answer",
    score: verdict === "Ok" ? 9 : 2,
    verdict,
    feedback: "feedback",
  });
}

describe("getTagMasteryStatuses (real Postgres)", () => {
  it("includes a tag with zero scored attempts as status new", async () => {
    const tag = await resolveOrCreateTag(`status-new-${randomUUID()}`);

    const statuses = await getTagMasteryStatuses();

    expect(statuses.find((row) => row.tagId === tag.id)).toEqual({
      tagId: tag.id,
      name: tag.name,
      status: "new",
    });
  });

  it("reports status mastered once a tag reaches the mastery threshold", async () => {
    const tag = await resolveOrCreateTag(`status-mastered-${randomUUID()}`);
    const bit = await seedKnowledgeBit("Mastered bit");
    const variant = await seedVariant(bit, "Why mastered?");

    await assignTag(tag.id, "knowledgeBit", bit);

    await recordAttempt(variant, "Ok");
    await recordAttempt(variant, "Ok");
    await recordAttempt(variant, "Ok");

    const statuses = await getTagMasteryStatuses();

    expect(statuses.find((row) => row.tagId === tag.id)?.status).toBe("mastered");
  });

  it("reports status struggling after the latest attempt is a non-Ok verdict", async () => {
    const tag = await resolveOrCreateTag(`status-struggling-${randomUUID()}`);
    const bit = await seedKnowledgeBit("Struggling bit");
    const variant = await seedVariant(bit, "Why struggling?");

    await assignTag(tag.id, "knowledgeBit", bit);

    await recordAttempt(variant, "Ok");
    await recordAttempt(variant, "NeedsDeepDive");

    const statuses = await getTagMasteryStatuses();

    expect(statuses.find((row) => row.tagId === tag.id)?.status).toBe("struggling");
  });

  it("reports status practicing for a tag with some corrects short of the mastery threshold", async () => {
    const tag = await resolveOrCreateTag(`status-practicing-${randomUUID()}`);
    const bit = await seedKnowledgeBit("Practicing bit");
    const variant = await seedVariant(bit, "Why practicing?");

    await assignTag(tag.id, "knowledgeBit", bit);

    await recordAttempt(variant, "Ok");

    const statuses = await getTagMasteryStatuses();

    expect(statuses.find((row) => row.tagId === tag.id)?.status).toBe("practicing");
  });
});
