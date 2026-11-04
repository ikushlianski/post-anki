import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

const dbName = `notion_runs_${randomUUID().replace(/-/g, "_")}`;
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
process.env.LLM_DAILY_BUDGET_USD = "1";
process.env.LLM_MODE = "real";

vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({ kickSourcesAfterAdd: vi.fn() }));

const repo = await import("./notion-ingestion-source.repo.js");
const { claimDueNotionSource, listDueNotionSources } = await import("./notion-source-due.repo.js");
const { runDueNotionSources } = await import("./run-due-notion-sources.js");
const { FakeNotionPageGateway } = await import("./fake-notion-page.gateway.js");
const { ensureEnglishForItSubject } = await import("../subject/seed/english-sub-subjects.seed.js");

const NOW = new Date("2026-10-30T12:00:00Z");
const DUE_AT = new Date("2026-10-30T01:00:00Z");
const pageIdOf = (n: number) => String(n).repeat(32);
const pageUrlOf = (n: number) => `https://www.notion.so/P${n}-${pageIdOf(n)}`;

let client: pg.Client;
let subjectId: string;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  subjectId = await ensureEnglishForItSubject();
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

async function addDueSource(n: number, options: { paused?: boolean; frequency?: "nightly" | "manual" } = {}) {
  const created = await repo.createNotionSource(
    {
      name: `Source ${n}`,
      pageUrl: pageUrlOf(n),
      subjectId,
      itemsPerRun: 20,
      frequency: options.frequency ?? "nightly",
      removeAfterImport: false,
    },
    new Date("2026-10-01T00:00:00Z"),
  );

  if (created.kind !== "created") {
    throw new Error("setup");
  }

  await client.query("UPDATE notion_ingestion_sources SET next_run_at = $2, paused = $3 WHERE id = $1", [
    created.source.id,
    DUE_AT,
    options.paused ?? false,
  ]);

  return created.source.id;
}

async function nextRunAt(id: string): Promise<Date | null> {
  const { rows } = await client.query("SELECT next_run_at FROM notion_ingestion_sources WHERE id = $1", [id]);

  return rows[0].next_run_at;
}

describe("scheduled runs", () => {
  it("should run a due source once when two ticks arrive at the same time", async () => {
    const id = await addDueSource(1);
    const gateway = new FakeNotionPageGateway();

    gateway.setPage(pageIdOf(1), [
      { id: "b1", text: "touch base" },
      { id: "b2", text: "circle back" },
    ]);

    const [first, second] = await Promise.all([
      runDueNotionSources(gateway, () => NOW),
      runDueNotionSources(gateway, () => NOW),
    ]);

    expect([...first, ...second].filter((r) => r.sourceId === id)).toHaveLength(1);
    expect(gateway.readCalls).toBe(1);

    const runs = await client.query(
      "SELECT trigger, status, imported FROM notion_ingestion_runs WHERE source_id = $1",
      [id],
    );
    const phrases = await client.query(
      "SELECT 1 FROM knowledge_sources WHERE import_key IN ('phrase:touch base','phrase:circle back')",
    );

    expect(runs.rows).toEqual([{ trigger: "scheduled", status: "ok", imported: 2 }]);
    expect(phrases.rowCount).toBe(2);
    expect((await nextRunAt(id))?.toISOString()).toBe("2026-10-31T01:00:00.000Z");
  });

  it("should not run the source again on a later tick before it is due", async () => {
    const gateway = new FakeNotionPageGateway();

    await runDueNotionSources(gateway, () => new Date("2026-10-30T13:00:00Z"));

    expect(gateway.readCalls).toBe(0);
  });

  it("should never pick a paused or a manual source", async () => {
    const paused = await addDueSource(2, { paused: true });
    const manual = await addDueSource(3, { frequency: "manual" });

    await client.query("UPDATE notion_ingestion_sources SET next_run_at = $2 WHERE id = $1", [manual, DUE_AT]);

    const gateway = new FakeNotionPageGateway();
    const reports = await runDueNotionSources(gateway, () => NOW);
    const ids = reports.map((r) => r.sourceId);

    expect(ids).not.toContain(paused);
    expect(ids).not.toContain(manual);
    expect(gateway.readCalls).toBe(0);
  });

  it("should move a failing source to its next slot so a broken page cannot loop", async () => {
    const id = await addDueSource(4);
    const gateway = new FakeNotionPageGateway();

    gateway.readError = new Error("notion down");

    const first = await runDueNotionSources(gateway, () => NOW);
    const second = await runDueNotionSources(gateway, () => NOW);

    expect(first.find((r) => r.sourceId === id)?.status).toBe("failed");
    expect(second.find((r) => r.sourceId === id)).toBeUndefined();
    expect((await nextRunAt(id))?.toISOString()).toBe("2026-10-31T01:00:00.000Z");
  });

  it("should make a source due again after the lease when the process died mid-run", async () => {
    const id = await addDueSource(7);
    const [candidate] = (await listDueNotionSources(NOW)).filter((source) => source.id === id);

    if (!candidate) {
      throw new Error("setup");
    }

    const claimed = await claimDueNotionSource(candidate, NOW);

    expect(claimed).not.toBeNull();
    expect((await nextRunAt(id))?.toISOString()).toBe("2026-10-30T12:20:00.000Z");

    const gateway = new FakeNotionPageGateway();

    await runDueNotionSources(gateway, () => new Date("2026-10-30T12:10:00Z"));

    expect(gateway.readCalls).toBe(0);

    const later = await runDueNotionSources(gateway, () => new Date("2026-10-30T12:21:00Z"));

    expect(later.map((r) => r.sourceId)).toContain(id);
    expect(gateway.readCalls).toBeGreaterThan(0);
    expect((await nextRunAt(id))?.toISOString()).toBe("2026-10-31T01:00:00.000Z");
  });

  it("should stop at the daily budget cap, read nothing and keep the source due", async () => {
    const id = await addDueSource(5);
    const other = await addDueSource(6);
    const today = new Date().toISOString().slice(0, 10);

    await client.query("INSERT INTO llm_daily_spend (day, spent_usd) VALUES ($1, 5)", [today]);

    const gateway = new FakeNotionPageGateway();
    const reports = await runDueNotionSources(gateway, () => NOW);

    expect(reports.map((r) => r.status)).toEqual(["skipped_budget"]);
    expect(gateway.readCalls).toBe(0);
    expect(reports[0]?.sourceId === id || reports[0]?.sourceId === other).toBe(true);
    expect((await nextRunAt(reports[0]?.sourceId ?? ""))?.toISOString()).toBe(DUE_AT.toISOString());
  });
});
