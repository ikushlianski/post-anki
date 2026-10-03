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

const dbName = `tag_mastery_${randomUUID().replace(/-/g, "_")}`;
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

const { getTagMasteryLevels, resolveOrCreateTag, assignTag } = await import("./tag.repo.js");
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

describe("getTagMasteryLevels (real Postgres)", () => {
  it("returns an empty map for a tag with zero scored attempts", async () => {
    const tag = await resolveOrCreateTag(`no-attempts-${randomUUID()}`);

    const levels = await getTagMasteryLevels([tag.id]);

    expect(levels.get(tag.id)).toBeUndefined();
  });

  it("folds attempts across different bits sharing the same tag into one stream", async () => {
    const tag = await resolveOrCreateTag(`shared-${randomUUID()}`);
    const bitA = await seedKnowledgeBit("Bit A body");
    const bitB = await seedKnowledgeBit("Bit B body");
    const variantA = await seedVariant(bitA, "Why A?");
    const variantB = await seedVariant(bitB, "Why B?");

    await assignTag(tag.id, "knowledgeBit", bitA);
    await assignTag(tag.id, "knowledgeBit", bitB);

    await recordAttempt(variantA, "Ok");
    await recordAttempt(variantB, "Ok");
    await recordAttempt(variantA, "Ok");

    const levels = await getTagMasteryLevels([tag.id]);

    expect(levels.get(tag.id)?.status).toBe("mastered");
    expect(levels.get(tag.id)?.masteryStage).toBe(3);
  });

  it("resets to struggling on a non-Ok verdict", async () => {
    const tag = await resolveOrCreateTag(`struggling-${randomUUID()}`);
    const bit = await seedKnowledgeBit("Bit body");
    const variant = await seedVariant(bit, "Why?");

    await assignTag(tag.id, "knowledgeBit", bit);

    await recordAttempt(variant, "Ok");
    await recordAttempt(variant, "NeedsDeepDive");

    const levels = await getTagMasteryLevels([tag.id]);

    expect(levels.get(tag.id)?.status).toBe("struggling");
    expect(levels.get(tag.id)?.masteryStage).toBe(0);
  });

  it("keeps each tag's fold independent in a batched call", async () => {
    const tagA = await resolveOrCreateTag(`batch-a-${randomUUID()}`);
    const tagB = await resolveOrCreateTag(`batch-b-${randomUUID()}`);
    const bitA = await seedKnowledgeBit("Batch bit A");
    const bitB = await seedKnowledgeBit("Batch bit B");
    const variantA = await seedVariant(bitA, "Why batch A?");
    const variantB = await seedVariant(bitB, "Why batch B?");

    await assignTag(tagA.id, "knowledgeBit", bitA);
    await assignTag(tagB.id, "knowledgeBit", bitB);

    await recordAttempt(variantA, "Ok");
    await recordAttempt(variantA, "Ok");
    await recordAttempt(variantA, "Ok");
    await recordAttempt(variantB, "NeedsDeepDive");

    const levels = await getTagMasteryLevels([tagA.id, tagB.id]);

    expect(levels.get(tagA.id)?.status).toBe("mastered");
    expect(levels.get(tagB.id)?.status).toBe("struggling");
  });

  it("breaks a created_at tie deterministically by id, not by chance row order", async () => {
    const tag = await resolveOrCreateTag(`tie-${randomUUID()}`);
    const bit = await seedKnowledgeBit("Tie bit");
    const variant = await seedVariant(bit, "Why tie?");

    await assignTag(tag.id, "knowledgeBit", bit);

    const sameTimestamp = new Date();
    const earlierId = "kbva_0_tie";
    const laterId = "kbva_1_tie";

    await client.query(
      `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback, created_at)
       VALUES ($1, $2, 'first', 2, 'NeedsDeepDive', 'fb', $3)`,
      [earlierId, variant, sameTimestamp],
    );
    await client.query(
      `INSERT INTO knowledge_bit_variant_attempts (id, variant_id, user_answer, score, verdict, feedback, created_at)
       VALUES ($1, $2, 'second', 9, 'Ok', 'fb', $3)`,
      [laterId, variant, sameTimestamp],
    );

    const first = await getTagMasteryLevels([tag.id]);
    const second = await getTagMasteryLevels([tag.id]);

    expect(first.get(tag.id)).toEqual(second.get(tag.id));
    expect(first.get(tag.id)?.status).toBe("practicing");
    expect(first.get(tag.id)?.masteryStage).toBe(1);
  });

  it("excludes attempts against an untagged bit from every tag's fold", async () => {
    const tag = await resolveOrCreateTag(`untagged-sibling-${randomUUID()}`);
    const taggedBit = await seedKnowledgeBit("Tagged bit");
    const untaggedBit = await seedKnowledgeBit("Untagged bit");
    const taggedVariant = await seedVariant(taggedBit, "Why tagged?");
    const untaggedVariant = await seedVariant(untaggedBit, "Why untagged?");

    await assignTag(tag.id, "knowledgeBit", taggedBit);

    await recordAttempt(taggedVariant, "Ok");
    await recordAttempt(untaggedVariant, "Ok");
    await recordAttempt(untaggedVariant, "Ok");

    const levels = await getTagMasteryLevels([tag.id]);

    expect(levels.get(tag.id)?.masteryStage).toBe(1);
  });
});
