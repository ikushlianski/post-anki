import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";
import { RU_EXAMPLE_ITEMS, RU_SOURCE_TEXT } from "./knowledge-bit-source-items.test-mocks.js";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const mockWriteItems = vi.fn();
const failInsert = { on: false };
const failAfterClaim = { on: false };

vi.mock("../mastra/knowledge-bit-source-items.agent.js", () => ({
  runKnowledgeBitSourceItems: (...args: unknown[]) => mockWriteItems(...args),
}));

vi.mock("./knowledge-bit-source-items.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./knowledge-bit-source-items.repo.js")>(
    "./knowledge-bit-source-items.repo.js",
  );

  return {
    ...actual,
    insertSourceItemsForChunk: (...args: Parameters<typeof actual.insertSourceItemsForChunk>) => {
      if (failInsert.on) {
        throw new Error("insert exploded");
      }

      return actual.insertSourceItemsForChunk(...args);
    },
  };
});

vi.mock("./knowledge-bit.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./knowledge-bit.repo.js")>("./knowledge-bit.repo.js");

  return {
    ...actual,
    claimOrLoadSourceForExtraction: async (...args: Parameters<typeof actual.claimOrLoadSourceForExtraction>) => {
      const claimed = await actual.claimOrLoadSourceForExtraction(...args);

      if (failAfterClaim.on) {
        throw new Error("claim connection dropped after commit");
      }

      return claimed;
    },
  };
});

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `durable_extraction_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
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
process.env.DBOS_APPLICATION_VERSION = "integration-test";
process.env.DURABLE_EXTRACTION_ENGINE = "dbos";

const { startDurableExtraction, shutdownDurableExtraction } = await import("./durable-extraction.starter.js");
const { DBOS } = await import("@dbos-inc/dbos-sdk");
const { claimOrLoadSourceForExtraction, failProcessingSourcesWithEndedWorkflows, markSourceOwnedByDurable, releaseDurableOwner, getKnowledgeSourceClaimToken } = await import("./knowledge-bit.repo.js");
const { claimSourceForRegeneration } = await import("../knowledge-source/knowledge-source-regeneration.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await shutdownDurableExtraction();
  await client?.end();
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

async function seedPendingSource(rawText = RU_SOURCE_TEXT): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
    [id, rawText],
  );

  return id;
}

async function startOne(sourceId: string, regeneration = false): Promise<string> {
  const result = await startDurableExtraction([sourceId], { regeneration });

  expect(result.started).toHaveLength(1);

  return result.started[0] as string;
}

async function waitForStatus(sourceId: string, wanted: string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const result = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [sourceId]);

    if (result.rows[0]?.status === wanted) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`source ${sourceId} did not reach ${wanted}`);
}

async function stepNames(workflowId: string): Promise<string[]> {
  const result = await client.query(
    `SELECT function_name FROM dbos.operation_outputs WHERE workflow_uuid = $1 ORDER BY function_id`,
    [workflowId],
  );

  return result.rows.map((row) => row.function_name as string);
}

describe("durable extraction workflow (real Postgres, real DBOS, fake model)", () => {
  it("should extract a pending source through claim, plan, chunk and finish steps, each run once", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = await seedPendingSource();
    const claimToken = await getKnowledgeSourceClaimToken(sourceId);
    const workflowId = `${sourceId}:${claimToken.run}`;

    const result = await startDurableExtraction([sourceId], { regeneration: false });

    expect(result).toEqual({ started: [workflowId], fallbackIds: [], unknownIds: [] });

    await waitForStatus(sourceId, "bits_detected");

    const bits = await client.query(`SELECT ordinal, body FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY ordinal`, [sourceId]);

    expect(bits.rows.map((row) => row.body)).toEqual(RU_EXAMPLE_ITEMS.map((item) => item.statement));
    expect(mockWriteItems).toHaveBeenCalledTimes(1);
    expect(await stepNames(workflowId)).toEqual(["claim", "plan", "chunk-0", "finish"]);
  }, 60_000);

  it("should treat a second start with the same workflow id as a no-op", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = await seedPendingSource();

    const { startExtractionWorkflow } = await import("./durable-extraction.workflow.js");

    await startExtractionWorkflow({ sourceId, regeneration: false }, 7777);
    await startExtractionWorkflow({ sourceId, regeneration: false }, 7777);
    await waitForStatus(sourceId, "bits_detected");
    await new Promise((resolve) => setTimeout(resolve, 500));

    const workflows = await client.query(`SELECT count(*)::int AS n FROM dbos.workflow_status WHERE workflow_uuid = $1`, [`${sourceId}:7777`]);
    const bits = await client.query(`SELECT count(*)::int AS n FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);

    expect(workflows.rows[0].n).toBe(1);
    expect(mockWriteItems).toHaveBeenCalledTimes(1);
    expect(bits.rows[0].n).toBe(RU_EXAMPLE_ITEMS.length);
  }, 60_000);

  it("should mark the source failed with a short reason code when a chunk step fails", async () => {
    mockWriteItems.mockReset().mockRejectedValue(new Error("provider timeout"));
    const sourceId = await seedPendingSource();

    await startDurableExtraction([sourceId], { regeneration: false });
    await waitForStatus(sourceId, "failed");

    const row = await client.query(`SELECT failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(row.rows[0].failure_reason).toBe("extraction_failed");
  }, 60_000);

  it("should leave an already detected source untouched when its workflow runs again for a new run id", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = await seedPendingSource();

    await startDurableExtraction([sourceId], { regeneration: false });
    await waitForStatus(sourceId, "bits_detected");
    await startDurableExtraction([sourceId], { regeneration: false });
    await new Promise((resolve) => setTimeout(resolve, 800));

    const bits = await client.query(`SELECT count(*)::int AS n FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);

    expect(bits.rows[0].n).toBe(RU_EXAMPLE_ITEMS.length);
    expect(mockWriteItems).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("should end an unexpected workflow error with the source marked failed, not stuck in processing", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    failInsert.on = true;

    const sourceId = await seedPendingSource();
    let workflowId = "";

    try {
      workflowId = await startOne(sourceId);
      await waitForStatus(sourceId, "failed");
    } finally {
      failInsert.on = false;
    }

    const row = await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(row.rows[0]).toEqual({ status: "failed", failure_reason: "extraction_failed" });
    expect(await stepNames(workflowId)).toContain("guard");
  }, 60_000);

  it("should mark a source failed when its workflow was cancelled, so Regenerate can run again", async () => {
    let release: (() => void) | undefined;

    mockWriteItems.mockReset().mockImplementation(
      () => new Promise((resolve) => {
        release = () => resolve(RU_EXAMPLE_ITEMS);
      }),
    );

    const sourceId = await seedPendingSource();

    const workflowId = await startOne(sourceId);

    await vi.waitFor(() => expect(release).toBeDefined(), { timeout: 10_000 });
    await DBOS.cancelWorkflow(workflowId);
    release?.();
    await vi.waitFor(
      async () => {
        const status = await client.query(`SELECT status FROM dbos.workflow_status WHERE workflow_uuid = $1`, [workflowId]);

        expect(status.rows[0]?.status).toBe("CANCELLED");
      },
      { timeout: 15_000 },
    );

    const failed = await failProcessingSourcesWithEndedWorkflows(DBOS.executorID);
    const row = await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(failed).toContain(sourceId);
    expect(row.rows[0]).toEqual({ status: "failed", failure_reason: "workflow_cancelled" });
  }, 60_000);

  it("should resume a source whose claim was written but never recorded, instead of ending as skipped", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = `ksrc_${randomUUID()}`;
    const claimedAt = new Date();

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at) VALUES ($1, 'prose', $2, 'processing', $3, $4)`,
      [sourceId, RU_SOURCE_TEXT, `durable:${sourceId}:${claimedAt.getTime()}`, claimedAt],
    );

    await startDurableExtraction([sourceId], { regeneration: false });
    await waitForStatus(sourceId, "bits_detected");

    const bits = await client.query(`SELECT count(*)::int AS n FROM knowledge_bits WHERE knowledge_source_id = $1`, [sourceId]);

    expect(bits.rows[0].n).toBe(RU_EXAMPLE_ITEMS.length);
  }, 60_000);

  it("should return the same claim when the claim step runs again for the same workflow and nothing for another one", async () => {
    const sourceId = await seedPendingSource();

    const first = await claimOrLoadSourceForExtraction(sourceId, { regeneration: false, workflowId: `${sourceId}:1` });
    const replay = await claimOrLoadSourceForExtraction(sourceId, { regeneration: false, workflowId: `${sourceId}:1` });
    const stranger = await claimOrLoadSourceForExtraction(sourceId, { regeneration: false, workflowId: `${sourceId}:2` });

    expect(first?.claimedAt.getTime()).toBe(replay?.claimedAt.getTime());
    expect(stranger).toBeNull();
  }, 30_000);

  it("should keep the source text and the model feedback out of the engine tables", async () => {
    const marker = `МАРКЕР-ТЕКСТА-${randomUUID()}`;

    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = await seedPendingSource(`${RU_SOURCE_TEXT}\n\n${marker} финальная фраза.`);

    const workflowId = await startOne(sourceId);

    await waitForStatus(sourceId, "bits_detected");

    const stored = await client.query(
      `SELECT coalesce(w.inputs::text, '') || coalesce(w.output::text, '') || coalesce(w.error, '') AS wf,
              (SELECT string_agg(coalesce(o.output::text, '') || coalesce(o.error, ''), ' ')
                 FROM dbos.operation_outputs o WHERE o.workflow_uuid = w.workflow_uuid) AS steps
         FROM dbos.workflow_status w WHERE w.workflow_uuid = $1`,
      [workflowId],
    );

    expect(`${stored.rows[0].wf} ${stored.rows[0].steps}`).not.toContain(marker);
    expect(`${stored.rows[0].wf} ${stored.rows[0].steps}`).not.toContain("ПЕРВЫЙ-АБЗАЦ-НЕ-ХРАНИТЬ");
  }, 60_000);

  it("should run under an executor id of its own, not the shared default", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    const sourceId = await seedPendingSource();

    const workflowId = await startOne(sourceId);

    await waitForStatus(sourceId, "bits_detected");

    const row = await client.query(`SELECT executor_id FROM dbos.workflow_status WHERE workflow_uuid = $1`, [workflowId]);

    expect(row.rows[0].executor_id).toBe(DBOS.executorID);
    expect(DBOS.executorID).not.toBe("local");
  }, 60_000);

  it("should keep error text, causes and bodies out of the engine tables when the model fails", async () => {
    const marker = `МАРКЕР-ОШИБКИ-${randomUUID()}`;
    const failure = new Error(`provider said: ${marker}`, { cause: new Error(`body ${marker}`) });

    mockWriteItems.mockReset().mockRejectedValue(failure);
    const sourceId = await seedPendingSource();

    const workflowId = await startOne(sourceId);

    await waitForStatus(sourceId, "failed");
    await vi.waitFor(
      async () => {
        const status = await client.query(`SELECT status FROM dbos.workflow_status WHERE workflow_uuid = $1`, [workflowId]);

        expect(["SUCCESS", "ERROR"]).toContain(status.rows[0]?.status);
      },
      { timeout: 15_000 },
    );

    const stored = await client.query(
      `SELECT coalesce(w.inputs::text, '') || coalesce(w.output::text, '') || coalesce(w.error, '') AS wf,
              (SELECT string_agg(coalesce(o.output::text, '') || coalesce(o.error, ''), ' ')
                 FROM dbos.operation_outputs o WHERE o.workflow_uuid = w.workflow_uuid) AS steps
         FROM dbos.workflow_status w WHERE w.workflow_uuid = $1`,
      [workflowId],
    );
    const source = await client.query(`SELECT failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(`${stored.rows[0].wf} ${stored.rows[0].steps}`).not.toContain(marker);
    expect(source.rows[0].failure_reason).toBe("extraction_failed");
  }, 60_000);

  it("should fail the source when the claim step throws after its write committed", async () => {
    mockWriteItems.mockReset().mockResolvedValue(RU_EXAMPLE_ITEMS);
    failAfterClaim.on = true;

    const sourceId = await seedPendingSource();
    let workflowId = "";

    try {
      workflowId = await startOne(sourceId);
      await waitForStatus(sourceId, "failed");
    } finally {
      failAfterClaim.on = false;
    }

    const row = await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(row.rows[0]).toEqual({ status: "failed", failure_reason: "extraction_failed" });
    expect(await stepNames(workflowId)).toContain("release");
    expect(mockWriteItems).not.toHaveBeenCalled();
  }, 60_000);

  it("should fail the source of a workflow that exhausted its recovery attempts instead of leaving it processing", async () => {
    mockWriteItems.mockReset().mockImplementation(() => new Promise(() => undefined));
    const sourceId = await seedPendingSource();

    const workflowId = await startOne(sourceId);

    await vi.waitFor(() => expect(mockWriteItems).toHaveBeenCalled(), { timeout: 10_000 });
    await client.query(
      `UPDATE dbos.workflow_status SET status = 'MAX_RECOVERY_ATTEMPTS_EXCEEDED', recovery_attempts = 4 WHERE workflow_uuid = $1`,
      [workflowId],
    );

    const failed = await failProcessingSourcesWithEndedWorkflows(DBOS.executorID);
    const row = await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(failed).toContain(sourceId);
    expect(row.rows[0]).toEqual({ status: "failed", failure_reason: "workflow_max_recovery_attempts_exceeded" });
  }, 60_000);

  it("should leave a long run alone while steps keep completing and fail it once the progress is older than the cutoff", async () => {
    mockWriteItems.mockReset().mockImplementation(() => new Promise(() => undefined));
    const sourceId = await seedPendingSource();
    const minutes = (n: number) => n * 60 * 1000;
    const workflowId = await startOne(sourceId);

    await vi.waitFor(() => expect(mockWriteItems).toHaveBeenCalled(), { timeout: 10_000 });

    const ageProgress = async (ageMs: number) => {
      await client.query(
        `UPDATE dbos.workflow_status SET executor_id = 'dead-executor', updated_at = (extract(epoch from now()) * 1000)::bigint - $2 WHERE workflow_uuid = $1`,
        [workflowId, ageMs],
      );
      await client.query(
        `UPDATE dbos.operation_outputs SET completed_at_epoch_ms = (extract(epoch from now()) * 1000)::bigint - $2 WHERE workflow_uuid = $1`,
        [workflowId, ageMs],
      );
    };

    await client.query(`UPDATE knowledge_sources SET updated_at = now() - interval '50 minutes' WHERE id = $1`, [sourceId]);
    await ageProgress(minutes(5));

    expect(await failProcessingSourcesWithEndedWorkflows(DBOS.executorID, undefined, minutes(30))).not.toContain(sourceId);

    await ageProgress(minutes(45));

    expect(await failProcessingSourcesWithEndedWorkflows(DBOS.executorID, undefined, minutes(30))).toContain(sourceId);

    const row = await client.query(`SELECT status, failure_reason FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(row.rows[0]).toEqual({ status: "failed", failure_reason: "workflow_executor_lost" });
  }, 60_000);

  it("should not let the legacy stale reset touch a durable run that is only 20 minutes old, but reset one past the ceiling", async () => {
    const fresh = `ksrc_${randomUUID()}`;
    const abandoned = `ksrc_${randomUUID()}`;

    for (const [id, age] of [[fresh, "20 minutes"], [abandoned, "7 hours"]] as const) {
      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at) VALUES ($1, 'prose', 'x', 'processing', $2, now() - $3::interval)`,
        [id, `durable:${id}:1`, age],
      );
    }

    const { resetStaleProcessingKnowledgeSources } = await import("./knowledge-bit.repo.js");

    await resetStaleProcessingKnowledgeSources(15 * 60 * 1000);

    const rows = await client.query(`SELECT id, status FROM knowledge_sources WHERE id = ANY($1)`, [[fresh, abandoned]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.status]));

    expect(byId[fresh]).toBe("processing");
    expect(byId[abandoned]).toBe("pending");
  }, 30_000);

  it("should keep a regeneration claimed by the durable path out of the legacy reset for 20 minutes but not for 7 hours", async () => {
    const fresh = `ksrc_${randomUUID()}`;
    const abandoned = `ksrc_${randomUUID()}`;

    for (const id of [fresh, abandoned]) {
      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'x', 'bits_detected')`,
        [id],
      );

      const claim = await claimSourceForRegeneration(id);

      expect(claim.ok).toBe(true);
      expect(await markSourceOwnedByDurable(id, `${id}:2`, await getKnowledgeSourceClaimToken(id))).toBe(true);
    }

    await client.query(`UPDATE knowledge_sources SET updated_at = now() - interval '20 minutes' WHERE id = $1`, [fresh]);
    await client.query(`UPDATE knowledge_sources SET updated_at = now() - interval '7 hours' WHERE id = $1`, [abandoned]);

    const { resetStaleProcessingKnowledgeSources } = await import("./knowledge-bit.repo.js");

    await resetStaleProcessingKnowledgeSources(15 * 60 * 1000);

    const rows = await client.query(`SELECT id, status FROM knowledge_sources WHERE id = ANY($1)`, [[fresh, abandoned]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r.status]));

    expect(byId[fresh]).toBe("processing");
    expect(byId[abandoned]).toBe("pending");
  }, 30_000);

  it("should refuse a regeneration claim without the owner marker, so a late start cannot run next to the fallback", async () => {
    const sourceId = `ksrc_${randomUUID()}`;

    await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'bits_detected')`, [sourceId, RU_SOURCE_TEXT]);
    await claimSourceForRegeneration(sourceId);

    expect(await claimOrLoadSourceForExtraction(sourceId, { regeneration: true, workflowId: `${sourceId}:2` })).toBeNull();

    await markSourceOwnedByDurable(sourceId, `${sourceId}:2`, await getKnowledgeSourceClaimToken(sourceId));

    expect(await claimOrLoadSourceForExtraction(sourceId, { regeneration: true, workflowId: `${sourceId}:2` })).not.toBeNull();

    await releaseDurableOwner(sourceId, `${sourceId}:2`);

    expect(await claimOrLoadSourceForExtraction(sourceId, { regeneration: true, workflowId: `${sourceId}:2` })).toBeNull();
  }, 30_000);

  it("should fail a durable-owned source past the stale cutoff from the scheduled path, and leave a fresh one alone", async () => {
    const orphan = `ksrc_${randomUUID()}`;
    const fresh = `ksrc_${randomUUID()}`;

    for (const [id, age] of [[orphan, "45 minutes"], [fresh, "2 minutes"]] as const) {
      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at) VALUES ($1, 'prose', 'x', 'processing', $2, now() - $3::interval)`,
        [id, `durable:${id}:1`, age],
      );
    }

    process.env.DURABLE_EXTRACTION = "1";

    try {
      const { reconcileDurableSources } = await import("./durable-extraction.reconcile.js");
      const failed = await reconcileDurableSources();

      expect(failed).toContain(orphan);
      expect(failed).not.toContain(fresh);
    } finally {
      delete process.env.DURABLE_EXTRACTION;
    }

    const rows = await client.query(`SELECT id, status, failure_reason FROM knowledge_sources WHERE id = ANY($1)`, [[orphan, fresh]]);
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

    expect(byId[orphan]).toMatchObject({ status: "failed", failure_reason: "workflow_executor_lost" });
    expect(byId[fresh].status).toBe("processing");
  }, 30_000);

  it("should still reconcile durable-owned orphans when the flag is off, and do nothing when there are none", async () => {
    const orphan = `ksrc_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status, failure_reason, updated_at) VALUES ($1, 'prose', 'x', 'processing', $2, now() - interval '45 minutes')`,
      [orphan, `durable:${orphan}:1`],
    );
    delete process.env.DURABLE_EXTRACTION;

    const { reconcileDurableSources } = await import("./durable-extraction.reconcile.js");

    expect(await reconcileDurableSources()).toContain(orphan);
    expect(await reconcileDurableSources()).toEqual([]);

    const row = await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [orphan]);

    expect(row.rows[0].status).toBe("failed");
  }, 30_000);

  it("should write the owner marker only for the run and claim time it was read with", async () => {
    const sourceId = `ksrc_${randomUUID()}`;

    await client.query(`INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'x', 'bits_detected')`, [sourceId]);
    await claimSourceForRegeneration(sourceId);

    const token = await getKnowledgeSourceClaimToken(sourceId);

    expect(await markSourceOwnedByDurable(sourceId, `${sourceId}:9`, { ...token, run: token.run + 1 })).toBe(false);
    expect(await markSourceOwnedByDurable(sourceId, `${sourceId}:9`, { ...token, claimedAt: new Date(token.claimedAt.getTime() + 1) })).toBe(false);
    expect(await markSourceOwnedByDurable(sourceId, `${sourceId}:${token.run}`, token)).toBe(true);
  }, 30_000);
});
