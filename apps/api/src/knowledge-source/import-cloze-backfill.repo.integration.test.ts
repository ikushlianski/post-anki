import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `import_cloze_backfill_${randomUUID().replace(/-/g, "_")}`;
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

const { listVerbatimClozeImportCandidates, restoreRebuiltCards, retireVerbatimClozeCards } = await import(
  "./import-cloze-backfill.repo.js"
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

interface BitSpec {
  id: string;
  body: string;
  state: string;
  sentence?: string;
}

async function insertSource(rawText: string, anki: boolean, createdAt: string = new Date().toISOString()): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, created_at, updated_at, import_key) VALUES ($1, 'prose', $2, 'bits_detected', $3, now(), $4)`,
    [sourceId, rawText, createdAt, anki ? `anki:${sourceId}` : null],
  );

  return sourceId;
}

async function insertBits(sourceId: string, bits: BitSpec[]): Promise<void> {
  for (const [index, bit] of bits.entries()) {
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, $5)`,
      [bit.id, sourceId, index, bit.body, bit.state],
    );

    if (bit.sentence) {
      await client.query(
        `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, sentence) VALUES ($1, $2, 'cloze', 1, $3, 'budget', $4)`,
        [`kbqv_${randomUUID()}`, bit.id, bit.body, bit.sentence],
      );
    }
  }
}

const NOTE = "A deal needs {{c1::budget}}.";

describe("import cloze backfill candidates (real Postgres)", () => {
  it("should list a source whose pending verbatim cloze card is the only live card", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [{ id: "kb_pending_only", body: "A deal needs budget.", state: "pending", sentence: NOTE }]);

    const candidates = await listVerbatimClozeImportCandidates();

    expect(candidates).toContainEqual({
      id: sourceId,
      pendingBitIds: ["kb_pending_only"],
      factText: "A deal needs budget.",
    });
  });

  it("should list only the pending verbatim card of a source that also has an approved card", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [
      { id: "kb_approved_mixed", body: "Approved claim.", state: "approved", sentence: NOTE },
      { id: "kb_pending_mixed", body: "A deal needs budget.", state: "pending", sentence: NOTE },
    ]);

    const candidate = (await listVerbatimClozeImportCandidates()).find((row) => row.id === sourceId);

    expect(candidate?.pendingBitIds).toEqual(["kb_pending_mixed"]);
  });

  it("should skip a source whose only card is already approved", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [{ id: "kb_only_approved", body: "A deal needs budget.", state: "approved", sentence: NOTE }]);

    expect((await listVerbatimClozeImportCandidates()).some((row) => row.id === sourceId)).toBe(false);
  });

  it("should skip a pending card that was rewritten away from the original note", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [
      { id: "kb_rewritten", body: "A deal needs budget.", state: "pending", sentence: "A deal {{c1::budget}} is rewritten." },
    ]);

    expect((await listVerbatimClozeImportCandidates()).some((row) => row.id === sourceId)).toBe(false);
  });

  it("should skip a source that did not come from an Anki import", async () => {
    const sourceId = await insertSource(NOTE, false);

    await insertBits(sourceId, [{ id: "kb_not_anki", body: "A deal needs budget.", state: "pending", sentence: NOTE }]);

    expect((await listVerbatimClozeImportCandidates()).some((row) => row.id === sourceId)).toBe(false);
  });

  it("should not list a source again once its verbatim card was retired and rebuilt", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [
      { id: "kb_retired_old", body: "A deal needs budget.", state: "superseded", sentence: NOTE },
      { id: "kb_rebuilt_same_note", body: "A deal needs budget.", state: "pending", sentence: NOTE },
    ]);

    expect((await listVerbatimClozeImportCandidates()).some((row) => row.id === sourceId)).toBe(false);
  });

  it("should return the oldest candidates first so a limit picks the same sources every run", async () => {
    const olderId = await insertSource(NOTE, true, "1999-01-01T00:00:00Z");
    const newerId = await insertSource(NOTE, true, "2000-01-01T00:00:00Z");

    await insertBits(olderId, [{ id: "kb_older", body: "A deal needs budget.", state: "pending", sentence: NOTE }]);
    await insertBits(newerId, [{ id: "kb_newer", body: "A deal needs budget.", state: "pending", sentence: NOTE }]);

    const first = await listVerbatimClozeImportCandidates({ limit: 1 });
    const second = await listVerbatimClozeImportCandidates({ limit: 1 });

    expect(first.map((row) => row.id)).toEqual([olderId]);
    expect(second.map((row) => row.id)).toEqual([olderId]);
  });
});

describe("retireVerbatimClozeCards (real Postgres)", () => {
  it("should retire only the listed pending cards and leave approved, inbox, chat, rejected and unlisted pending cards untouched", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [
      { id: "kb_retire_listed", body: "A deal needs budget.", state: "pending", sentence: NOTE },
      { id: "kb_retire_unlisted", body: "Unlisted claim.", state: "pending", sentence: NOTE },
      { id: "kb_retire_approved", body: "Approved claim.", state: "approved", sentence: NOTE },
      { id: "kb_retire_inbox", body: "Inbox claim.", state: "inbox", sentence: NOTE },
      { id: "kb_retire_chat", body: "Chat claim.", state: "chat", sentence: NOTE },
      { id: "kb_retire_rejected", body: "Rejected claim.", state: "rejected", sentence: NOTE },
    ]);

    const retired = await retireVerbatimClozeCards(sourceId, ["kb_retire_listed"]);
    const { rows } = await client.query<{ id: string; approval_state: string }>(
      `SELECT id, approval_state FROM knowledge_bits WHERE knowledge_source_id = $1 ORDER BY id`,
      [sourceId],
    );

    expect(retired).toBe(1);
    expect(Object.fromEntries(rows.map((row) => [row.id, row.approval_state]))).toEqual({
      kb_retire_approved: "approved",
      kb_retire_chat: "chat",
      kb_retire_inbox: "inbox",
      kb_retire_listed: "superseded",
      kb_retire_rejected: "rejected",
      kb_retire_unlisted: "pending",
    });
  });
});

async function setSourceState(sourceId: string, status: string, updatedAt: string, nothingExtracted = false): Promise<void> {
  await client.query(
    `UPDATE knowledge_sources SET status = $2, updated_at = $3, nothing_extracted_at = ${nothingExtracted ? "now()" : "NULL"} WHERE id = $1`,
    [sourceId, status, updatedAt],
  );
}

async function bitStates(sourceId: string): Promise<Record<string, string>> {
  const { rows } = await client.query<{ id: string; approval_state: string }>(
    `SELECT id, approval_state FROM knowledge_bits WHERE knowledge_source_id = $1`,
    [sourceId],
  );

  return Object.fromEntries(rows.map((row) => [row.id, row.approval_state]));
}

describe("restoreRebuiltCards (real Postgres)", () => {
  it("should put listed retired cards back to pending and leave other states untouched", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [
      { id: "kb_restore_listed", body: "A deal needs budget.", state: "superseded", sentence: NOTE },
      { id: "kb_restore_unlisted", body: "Other claim.", state: "superseded", sentence: NOTE },
      { id: "kb_restore_approved", body: "Approved claim.", state: "approved", sentence: NOTE },
      { id: "kb_restore_rejected", body: "Rejected claim.", state: "rejected", sentence: NOTE },
    ]);

    const restored = await restoreRebuiltCards(sourceId, ["kb_restore_listed", "kb_restore_approved", "kb_restore_rejected"]);

    expect(restored).toBe(1);
    expect(await bitStates(sourceId)).toEqual({
      kb_restore_approved: "approved",
      kb_restore_listed: "pending",
      kb_restore_rejected: "rejected",
      kb_restore_unlisted: "superseded",
    });
  });

  it("should not bring back a retired card the user already decided on", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [{ id: "kb_restore_decided", body: "Decided claim.", state: "superseded", sentence: NOTE }]);
    await client.query(`UPDATE knowledge_bits SET decided_at = now() WHERE id = 'kb_restore_decided'`);

    expect(await restoreRebuiltCards(sourceId, ["kb_restore_decided"])).toBe(0);
    expect(await bitStates(sourceId)).toEqual({ kb_restore_decided: "superseded" });
  });

  it("should return the source to its extracted state rather than nothing-extracted or failed", async () => {
    const sourceId = await insertSource(NOTE, true);

    await insertBits(sourceId, [{ id: "kb_restore_status", body: "A deal needs budget.", state: "superseded", sentence: NOTE }]);
    await setSourceState(sourceId, "bits_detected", new Date().toISOString(), true);
    await restoreRebuiltCards(sourceId, ["kb_restore_status"]);

    const { rows } = await client.query(`SELECT status, nothing_extracted_at FROM knowledge_sources WHERE id = $1`, [sourceId]);

    expect(rows[0]).toEqual({ status: "bits_detected", nothing_extracted_at: null });
  });
});
