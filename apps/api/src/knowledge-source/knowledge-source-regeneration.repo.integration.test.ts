import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import {
  RU_EXAMPLE_ITEMS,
  RU_SOURCE_TEXT,
} from "../knowledge-bit/knowledge-bit-source-items.test-mocks.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

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

const dbName = `knowledge_source_regeneration_${randomUUID().replace(/-/g, "_")}`;
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

const { claimSourceForRegeneration, getKnowledgeSourceRegenerationStatus } = await import(
  "./knowledge-source-regeneration.repo.js"
);
const { generateItemsForSource, defaultGenerateItemsDeps } = await import(
  "../knowledge-bit/detect-knowledge-bits.orchestrator.js"
);
const { approveKnowledgeBit, rejectKnowledgeBit, editKnowledgeBitQuestionVariant } = await import(
  "../knowledge-bit/knowledge-bit-approval.repo.js"
);
const { listKnowledgeBitsForWhQuestionGenerationScan, claimKnowledgeBitForWhQuestionGeneration } =
  await import("../knowledge-bit/knowledge-bit-wh-question-claim.repo.js");
const { listKnowledgeBitsForFillBlankGenerationScan } = await import(
  "../knowledge-bit/knowledge-bit-fill-blank-claim.repo.js"
);
const { listKnowledgeBitsForBasicCardGenerationScan } = await import(
  "../knowledge-bit/knowledge-bit-basic-card-claim.repo.js"
);
const { listKnowledgeBitsForTaggingScan } = await import("../knowledge-bit/knowledge-bit-tagging.repo.js");
const { listKnowledgeBitsForEmbeddingScan } = await import(
  "../knowledge-bit/knowledge-bit-embedding.repo.js"
);
const { listKnowledgeBitsForPlacementScan } = await import(
  "../knowledge-bit/knowledge-bit-placement.repo.js"
);
const { listQuestionVariantsForEmbeddingScan } = await import(
  "../knowledge-bit/knowledge-bit-question-variant.repo.js"
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

async function seedSource(status: string, rawText: string | null = RU_SOURCE_TEXT): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, $3)`,
    [id, rawText, status],
  );

  return id;
}

async function seedBit(sourceId: string, ordinal: number, state: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, sourceId, ordinal, `body ${id}`, state],
  );

  return id;
}

async function seedVariant(bitId: string): Promise<string> {
  const id = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'basic', 0, 'q', 'a')`,
    [id, bitId],
  );

  return id;
}

async function stateOf(bitId: string): Promise<string> {
  const rows = (await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [bitId])).rows;

  return rows[0].approval_state;
}

describe("claimSourceForRegeneration (real Postgres)", () => {
  it("should supersede only the pending bits of that source and leave approved, rejected and other sources alone", async () => {
    const sourceId = await seedSource("bits_detected");
    const otherId = await seedSource("bits_detected");
    const pendingA = await seedBit(sourceId, 0, "pending");
    const pendingB = await seedBit(sourceId, 1, "pending");
    const approved = await seedBit(sourceId, 2, "approved");
    const rejected = await seedBit(sourceId, 3, "rejected");
    const otherPending = await seedBit(otherId, 0, "pending");

    const result = await claimSourceForRegeneration(sourceId);

    expect(result).toMatchObject({ ok: true, supersededCount: 2, source: { id: sourceId } });
    expect(await stateOf(pendingA)).toBe("superseded");
    expect(await stateOf(pendingB)).toBe("superseded");
    expect(await stateOf(approved)).toBe("approved");
    expect(await stateOf(rejected)).toBe("rejected");
    expect(await stateOf(otherPending)).toBe("pending");
    expect(await getKnowledgeSourceRegenerationStatus(sourceId)).toEqual({
      status: "running",
      failureReason: null,
    });
  });

  it("should let exactly one of two simultaneous requests run and answer the other already_running", async () => {
    const sourceId = await seedSource("bits_detected");

    await seedBit(sourceId, 0, "pending");

    const results = await Promise.all([claimSourceForRegeneration(sourceId), claimSourceForRegeneration(sourceId)]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "already_running" }]);
  });

  it("should answer already_running for a pending or processing source and change nothing", async () => {
    for (const status of ["pending", "processing"]) {
      const sourceId = await seedSource(status);
      const bit = await seedBit(sourceId, 0, "pending");

      expect(await claimSourceForRegeneration(sourceId)).toEqual({ ok: false, error: "already_running" });
      expect(await stateOf(bit)).toBe("pending");
    }
  });

  it("should allow a failed source, clearing the failure reason", async () => {
    const sourceId = await seedSource("failed");

    await client.query(`UPDATE knowledge_sources SET failure_reason = 'no_valid_items' WHERE id = $1`, [sourceId]);

    expect(await claimSourceForRegeneration(sourceId)).toMatchObject({ ok: true, supersededCount: 0 });
    expect(await getKnowledgeSourceRegenerationStatus(sourceId)).toEqual({
      status: "running",
      failureReason: null,
    });
  });

  it("should answer source_text_missing without superseding when raw_text is null", async () => {
    const sourceId = await seedSource("bits_detected", null);
    const bit = await seedBit(sourceId, 0, "pending");

    expect(await claimSourceForRegeneration(sourceId)).toEqual({ ok: false, error: "source_text_missing" });
    expect(await stateOf(bit)).toBe("pending");
  });

  it("should answer not_found for an unknown source", async () => {
    expect(await claimSourceForRegeneration("ksrc_missing")).toEqual({ ok: false, error: "not_found" });
    expect(await getKnowledgeSourceRegenerationStatus("ksrc_missing")).toBeNull();
  });

  it("should report done after a successful run and failed with the reason after a failed one", async () => {
    const sourceId = await seedSource("bits_detected");

    await claimSourceForRegeneration(sourceId);
    await client.query(`UPDATE knowledge_sources SET status = 'failed', failure_reason = 'x' WHERE id = $1`, [sourceId]);

    expect(await getKnowledgeSourceRegenerationStatus(sourceId)).toEqual({ status: "failed", failureReason: "x" });

    await client.query(`UPDATE knowledge_sources SET status = 'bits_detected' WHERE id = $1`, [sourceId]);

    expect(await getKnowledgeSourceRegenerationStatus(sourceId)).toEqual({ status: "done", failureReason: null });
  });
});

describe("superseded bits (real Postgres)", () => {
  it("should be returned by no scan while a pending bit still is, and embedding only picks up approved bits", async () => {
    const sourceId = await seedSource("bits_detected");
    const live = await seedBit(sourceId, 0, "pending");
    const gone = await seedBit(sourceId, 1, "pending");
    const liveVariant = await seedVariant(live);
    const goneVariant = await seedVariant(gone);

    await client.query(`UPDATE knowledge_bits SET approval_state = 'superseded' WHERE id = $1`, [gone]);

    const bitScans = await Promise.all([
      listKnowledgeBitsForWhQuestionGenerationScan(1000),
      listKnowledgeBitsForFillBlankGenerationScan(1000),
      listKnowledgeBitsForBasicCardGenerationScan(1000),
      listKnowledgeBitsForTaggingScan(1000),
      listKnowledgeBitsForPlacementScan(1000),
    ]);
    const approved = await seedBit(sourceId, 2, "approved");
    const embeddingIds = (await listKnowledgeBitsForEmbeddingScan(1000)).map((row) => row.id);

    for (const rows of bitScans) {
      const ids = rows.map((row) => row.id);

      expect(ids).toContain(live);
      expect(ids).not.toContain(gone);
    }

    expect(embeddingIds).toContain(approved);
    expect(embeddingIds).not.toContain(live);
    expect(embeddingIds).not.toContain(gone);

    const variantIds = (await listQuestionVariantsForEmbeddingScan(1000)).map((row) => row.id);

    expect(variantIds).toContain(liveVariant);
    expect(variantIds).not.toContain(goneVariant);
    expect(await claimKnowledgeBitForWhQuestionGeneration(gone, `body ${gone}`)).toBeNull();
  });

  it("should not be approvable, rejectable or editable, and keep the superseded state", async () => {
    const sourceId = await seedSource("bits_detected");
    const bit = await seedBit(sourceId, 0, "superseded");
    const variant = await seedVariant(bit);

    expect(await approveKnowledgeBit(bit)).toBe("blocked");
    expect((await rejectKnowledgeBit(bit)).ok).toBe(false);
    expect(await editKnowledgeBitQuestionVariant(variant, "new q", "new a")).toEqual({ error: "blocked" });
    expect(await stateOf(bit)).toBe("superseded");
  });

  it("should keep the normal decisions working for pending bits", async () => {
    const sourceId = await seedSource("bits_detected");
    const toApprove = await seedBit(sourceId, 0, "pending");
    const toReject = await seedBit(sourceId, 1, "pending");

    await seedVariant(toApprove);

    expect(await approveKnowledgeBit(toApprove)).toBe(true);
    expect(await approveKnowledgeBit(toApprove)).toBe(true);
    expect((await rejectKnowledgeBit(toApprove)).ok).toBe(false);
    expect((await rejectKnowledgeBit(toReject)).ok).toBe(true);
    expect(await approveKnowledgeBit(toReject)).toBe("blocked");
  });
});

describe("a second generation run after regeneration (real Postgres)", () => {
  it("should insert new pending bits at fresh ordinals without colliding with superseded ones", async () => {
    const sourceId = await seedSource("bits_detected");
    const first = vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const firstClaim = { id: sourceId, rawText: RU_SOURCE_TEXT, extractionModelId: null, subjectId: null, claimedAt: new Date() };

    await client.query(`UPDATE knowledge_sources SET status = 'processing', updated_at = $2 WHERE id = $1`, [
      sourceId,
      firstClaim.claimedAt,
    ]);
    await generateItemsForSource(firstClaim, {}, { ...defaultGenerateItemsDeps(), writeItems: first });

    const approvedBit = (
      await client.query(`SELECT id FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal LIMIT 1`, [
        sourceId,
      ])
    ).rows[0].id as string;

    await seedVariant(approvedBit);

    expect(await approveKnowledgeBit(approvedBit)).toBe(true);

    const claim = await claimSourceForRegeneration(sourceId);

    expect(claim).toMatchObject({ ok: true, supersededCount: 2 });

    if (!claim.ok) {
      return;
    }

    const second = vi.fn().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const result = await generateItemsForSource(
      claim.source,
      { modelId: "openrouter/google/gemini-3.1-flash-lite" },
      { ...defaultGenerateItemsDeps(), writeItems: second },
    );

    expect(result).toEqual({ status: "detected", inserted: 2, failureReason: null });
    expect(second).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ modelId: "openrouter/google/gemini-3.1-flash-lite" }),
    );

    const bits = (
      await client.query(
        `SELECT ordinal, approval_state FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal`,
        [sourceId],
      )
    ).rows;

    expect(bits.map((bit) => bit.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(bits.map((bit) => bit.approval_state)).toEqual([
      "approved",
      "superseded",
      "superseded",
      "pending",
      "pending",
    ]);
    expect(await getKnowledgeSourceRegenerationStatus(sourceId)).toEqual({ status: "done", failureReason: null });
  });
});
