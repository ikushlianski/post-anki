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

const dbName = `knowledge_bit_basic_card_claim_${randomUUID().replace(/-/g, "_")}`;
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
  listKnowledgeBitsForBasicCardGenerationScan,
  claimKnowledgeBitForBasicCardGeneration,
  markBasicCardGenerationFailed,
  recordGeneratedBasicCardVariant,
  BasicCardGenerationClaimLostError,
  BASIC_CARD_GENERATION_MAX_ATTEMPTS,
} = await import("./knowledge-bit-basic-card-claim.repo.js");

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

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  basicCardGeneratedAt: Date | null = null,
  basicCardGenerationFailedAt: Date | null = null,
  basicCardGenerationAttempts = 0,
  basicCardGenerationClaimedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits
       (id, knowledge_source_id, ordinal, body, basic_card_generated_at, basic_card_generation_failed_at,
        basic_card_generation_attempts, basic_card_generation_claimed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      knowledgeSourceId,
      ordinal,
      body,
      basicCardGeneratedAt,
      basicCardGenerationFailedAt,
      basicCardGenerationAttempts,
      basicCardGenerationClaimedAt,
    ],
  );

  return id;
}

describe("listKnowledgeBitsForBasicCardGenerationScan (real Postgres)", () => {
  it("excludes an already-generated bit, includes an untouched bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const untouchedId = await seedKnowledgeBit(sourceId, 0, "An ungenerated bit");

    const generatedId = await seedKnowledgeBit(sourceId, 1, "An already-generated bit", new Date());

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);
    const ids = rows.map((row) => row.id);

    expect(rows).toContainEqual({ id: untouchedId, body: "An ungenerated bit" });
    expect(ids).not.toContain(generatedId);
  });

  it("should exclude a rejected bit and still include a pending bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const pendingId = await seedKnowledgeBit(sourceId, 10, "A pending bit");
    const rejectedId = await seedKnowledgeBit(sourceId, 11, "A rejected bit");

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [
      rejectedId,
    ]);

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(rejectedId);
  });

  it("includes a bit that failed once and is still under the attempts cap", async () => {
    const sourceId = await seedKnowledgeSource();
    const retryableId = await seedKnowledgeBit(
      sourceId,
      0,
      "A once-failed bit",
      null,
      new Date(),
      BASIC_CARD_GENERATION_MAX_ATTEMPTS - 1,
    );

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);

    expect(rows.map((row) => row.id)).toContain(retryableId);
  });

  it("excludes a bit that has hit the attempts cap", async () => {
    const sourceId = await seedKnowledgeSource();
    const exhaustedId = await seedKnowledgeBit(
      sourceId,
      0,
      "An exhausted bit",
      null,
      new Date(),
      BASIC_CARD_GENERATION_MAX_ATTEMPTS,
    );

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);

    expect(rows.map((row) => row.id)).not.toContain(exhaustedId);
  });

  it("excludes a bit with a fresh, still-live claim from another in-flight scan", async () => {
    const sourceId = await seedKnowledgeSource();
    const claimedId = await seedKnowledgeBit(sourceId, 0, "A freshly-claimed bit", null, null, 0, new Date());

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);

    expect(rows.map((row) => row.id)).not.toContain(claimedId);
  });

  it("includes a bit whose claim is stale (older than the staleness window)", async () => {
    const sourceId = await seedKnowledgeSource();
    const staleClaimAt = new Date(Date.now() - 60 * 60 * 1000);
    const staleClaimedId = await seedKnowledgeBit(
      sourceId,
      0,
      "A stale-claimed bit",
      null,
      null,
      0,
      staleClaimAt,
    );

    const rows = await listKnowledgeBitsForBasicCardGenerationScan(1000);

    expect(rows.map((row) => row.id)).toContain(staleClaimedId);
  });
});

describe("claimKnowledgeBitForBasicCardGeneration (real Postgres)", () => {
  it("claims an unclaimed candidate bit and stamps basicCardGenerationClaimedAt", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit to claim");

    const claimToken = await claimKnowledgeBitForBasicCardGeneration(id, "A bit to claim");

    expect(typeof claimToken).toBe("string");

    const { rows } = await client.query(
      `SELECT basic_card_generation_claimed_at, basic_card_generation_claim_token FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.basic_card_generation_claimed_at).toBeInstanceOf(Date);
    expect(rows[0]!.basic_card_generation_claim_token).toBe(claimToken);
  });

  it("should refuse to claim a rejected bit", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A rejected bit");

    await client.query(`UPDATE knowledge_bits SET approval_state = 'rejected' WHERE id = $1`, [
      id,
    ]);

    const claimToken = await claimKnowledgeBitForBasicCardGeneration(id, "A rejected bit");

    expect(claimToken).toBeNull();
  });

  it("only lets one of two racing claims win, so a concurrent scan never double-charges", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit two scans race to claim");

    const [first, second] = await Promise.all([
      claimKnowledgeBitForBasicCardGeneration(id, "A bit two scans race to claim"),
      claimKnowledgeBitForBasicCardGeneration(id, "A bit two scans race to claim"),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("refuses to claim a bit that already has a fresh claim", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit already claimed", null, null, 0, new Date());

    const claimed = await claimKnowledgeBitForBasicCardGeneration(id, "A bit already claimed");

    expect(claimed).toBeNull();
  });

  it("can re-claim a bit whose prior claim is stale", async () => {
    const sourceId = await seedKnowledgeSource();
    const staleClaimAt = new Date(Date.now() - 60 * 60 * 1000);
    const id = await seedKnowledgeBit(sourceId, 0, "A bit with a stale claim", null, null, 0, staleClaimAt);

    const claimed = await claimKnowledgeBitForBasicCardGeneration(id, "A bit with a stale claim");

    expect(typeof claimed).toBe("string");
  });

  it("refuses to claim a bit that already hit the attempts cap", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(
      sourceId,
      0,
      "An exhausted bit",
      null,
      new Date(),
      BASIC_CARD_GENERATION_MAX_ATTEMPTS,
    );

    const claimed = await claimKnowledgeBitForBasicCardGeneration(id, "An exhausted bit");

    expect(claimed).toBeNull();
  });

  it("refuses to claim a bit whose body no longer matches what the scan read", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Original body");

    const claimed = await claimKnowledgeBitForBasicCardGeneration(id, "Stale body the scan read earlier");

    expect(claimed).toBeNull();

    const { rows } = await client.query(
      `SELECT basic_card_generation_claimed_at, basic_card_generation_claim_token FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.basic_card_generation_claimed_at).toBeNull();
    expect(rows[0]!.basic_card_generation_claim_token).toBeNull();
  });
});

describe("recordGeneratedBasicCardVariant (real Postgres)", () => {
  it("stores the card and marks the bit generated in one step, so the bit is never picked up again", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "TTL means time to live.");
    const token = (await claimKnowledgeBitForBasicCardGeneration(id, "TTL means time to live."))!;

    await recordGeneratedBasicCardVariant(id, "basic", 0, "What is TTL?", "Time to live", token);

    const variants = await client.query(
      `SELECT kind, prompt, answer FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [id],
    );
    const bit = await client.query(
      `SELECT basic_card_generated_at, basic_card_generation_claim_token FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(variants.rows).toEqual([{ kind: "basic", prompt: "What is TTL?", answer: "Time to live" }]);
    expect(bit.rows[0]!.basic_card_generated_at).toBeInstanceOf(Date);
    expect(bit.rows[0]!.basic_card_generation_claim_token).toBeNull();
  });

  it("stores nothing when the claim was taken over, so a slow run never leaves a duplicate card", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A contested bit");

    await claimKnowledgeBitForBasicCardGeneration(id, "A contested bit");

    await expect(
      recordGeneratedBasicCardVariant(id, "basic", 0, "Q?", "A", "bcgc_not_the_owner"),
    ).rejects.toBeInstanceOf(BasicCardGenerationClaimLostError);

    const variants = await client.query(
      `SELECT id FROM knowledge_bit_question_variants WHERE knowledge_bit_id = $1`,
      [id],
    );

    expect(variants.rows).toHaveLength(0);
  });

  it("allows only one active basic card per bit even if the claim logic is bypassed", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A bit with a card");
    const token = (await claimKnowledgeBitForBasicCardGeneration(id, "A bit with a card"))!;

    await recordGeneratedBasicCardVariant(id, "basic", 0, "Q?", "A", token);

    await expect(
      client.query(
        `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
         VALUES ($1, $2, 'basic', 0, 'Q2?', 'A2')`,
        [`kbqv_${randomUUID()}`, id],
      ),
    ).rejects.toThrow();
  });
});

describe("markBasicCardGenerationFailed (real Postgres)", () => {
  it("counts the attempt and releases the claim so the bit can be retried until the cap", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "A failing bit");
    const token = (await claimKnowledgeBitForBasicCardGeneration(id, "A failing bit"))!;

    await markBasicCardGenerationFailed(id, token);

    const { rows } = await client.query(
      `SELECT basic_card_generation_attempts, basic_card_generation_failed_at, basic_card_generation_claim_token FROM knowledge_bits WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.basic_card_generation_attempts).toBe(1);
    expect(rows[0]!.basic_card_generation_failed_at).toBeInstanceOf(Date);
    expect(rows[0]!.basic_card_generation_claim_token).toBeNull();
  });

  it("refuses a failure write from a run that no longer owns the claim", async () => {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, 0, "Another bit");

    await claimKnowledgeBitForBasicCardGeneration(id, "Another bit");

    await expect(markBasicCardGenerationFailed(id, "bcgc_not_the_owner")).rejects.toBeInstanceOf(
      BasicCardGenerationClaimLostError,
    );
  });
});

describe("basic-card generation skips approved bits (real Postgres)", () => {
  async function seedApprovedBit(ordinal: number, body: string): Promise<{ id: string }> {
    const sourceId = await seedKnowledgeSource();
    const id = await seedKnowledgeBit(sourceId, ordinal, body);

    await client.query(`UPDATE knowledge_bits SET approval_state = 'approved' WHERE id = $1`, [{ id }.id]);

    return { id };
  }

  it("should leave an approved bit out of the scan and still list a pending one", async () => {
    const approved = await seedApprovedBit(900, "An approved bit");
    const sourceId = await seedKnowledgeSource();
    const pendingId = await seedKnowledgeBit(sourceId, 901, "A pending bit");

    const ids = (await listKnowledgeBitsForBasicCardGenerationScan(1000)).map((row) => row.id);

    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(approved.id);
  });

  it("should refuse to claim an approved bit in a background scan", async () => {
    const approved = await seedApprovedBit(902, "Approved claim target");

    expect(await claimKnowledgeBitForBasicCardGeneration(approved.id, "Approved claim target")).toBeNull();
  });

  it("should let an explicit scan scoped to one approved bit list and claim it", async () => {
    const approved = await seedApprovedBit(903, "Explicitly requested");
    const other = await seedApprovedBit(904, "Not requested");
    const scope = { bitId: approved.id, includeApproved: true };

    const ids = (await listKnowledgeBitsForBasicCardGenerationScan(1000, scope)).map((row) => row.id);

    expect(ids).toEqual([approved.id]);
    expect(ids).not.toContain(other.id);
    expect(await claimKnowledgeBitForBasicCardGeneration(approved.id, "Explicitly requested", scope)).toEqual(expect.any(String));
  });
});
