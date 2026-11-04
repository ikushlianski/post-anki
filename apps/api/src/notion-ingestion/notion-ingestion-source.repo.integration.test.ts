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

const dbName = `notion_sources_${randomUUID().replace(/-/g, "_")}`;
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

const repo = await import("./notion-ingestion-source.repo.js");
const runRepo = await import("./notion-ingestion-run.repo.js");
const { insertPhraseKnowledgeSources } = await import("../knowledge-source/phrase-knowledge-source.repo.js");
const { ensureEnglishForItSubject } = await import("../subject/seed/english-sub-subjects.seed.js");

const PAGE_A = "https://www.notion.so/A-0123456789abcdef0123456789abcdef";
const PAGE_B = "https://www.notion.so/B-fedcba9876543210fedcba9876543210";
const NOW = new Date("2026-10-30T12:00:00Z");

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

function input(pageUrl: string, frequency: "manual" | "daily" | "nightly" = "manual") {
  return { name: "Phrases", pageUrl, subjectId, itemsPerRun: 20, frequency, removeAfterImport: false };
}

describe("notion ingestion sources", () => {
  it("should refuse a second source for the same page", async () => {
    const first = await repo.createNotionSource(input(PAGE_A), NOW);
    const second = await repo.createNotionSource(input(`${PAGE_A}?pvs=4`), NOW);

    expect(first.kind).toBe("created");
    expect(second).toEqual({ kind: "duplicate_page" });
  });

  it("should recompute the next run when the frequency changes and when a source is resumed, but not when paused", async () => {
    const created = await repo.createNotionSource(input(PAGE_B, "daily"), NOW);

    if (created.kind !== "created") throw new Error("setup");

    const id = created.source.id;
    const later = new Date("2026-10-31T00:30:00Z");

    expect(created.source.nextRunAt?.toISOString()).toBe("2026-10-31T12:00:00.000Z");

    const paused = await repo.updateNotionSource(id, { paused: true }, later);

    expect(paused.kind === "updated" && paused.source.nextRunAt?.toISOString()).toBe("2026-10-31T12:00:00.000Z");

    const nightly = await repo.updateNotionSource(id, { frequency: "nightly" }, later);

    expect(nightly.kind === "updated" && nightly.source.nextRunAt?.toISOString()).toBe("2026-10-31T01:00:00.000Z");

    const resumed = await repo.updateNotionSource(id, { paused: false }, new Date("2026-11-02T10:00:00Z"));

    expect(resumed.kind === "updated" && resumed.source.nextRunAt?.toISOString()).toBe("2026-11-03T01:00:00.000Z");

    const manual = await repo.updateNotionSource(id, { frequency: "manual" }, later);

    expect(manual.kind === "updated" && manual.source.nextRunAt).toBeNull();
  });

  it("should list the subject path and the last run of a source", async () => {
    const [view] = (await repo.listNotionSources()).filter((source) => source.pageUrl === PAGE_A);

    expect(view?.subjectPath).toEqual(["English", "English for IT"]);
    expect(view?.lastRun).toBeNull();
  });

  it("should keep imported cards when the source is deleted", async () => {
    const created = await repo.createNotionSource(
      input("https://www.notion.so/C-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      NOW,
    );

    if (created.kind !== "created") throw new Error("setup");

    await insertPhraseKnowledgeSources([{ key: "phrase:keep me", text: "Phrase: keep me" }], subjectId);
    await runRepo.startNotionRun(created.source.id, "manual", NOW);

    expect(await repo.deleteNotionSource(created.source.id)).toBe(true);

    const phrases = await client.query("SELECT 1 FROM knowledge_sources WHERE import_key = 'phrase:keep me'");
    const runs = await client.query("SELECT 1 FROM notion_ingestion_runs WHERE source_id = $1", [created.source.id]);

    expect(phrases.rowCount).toBe(1);
    expect(runs.rowCount).toBe(0);
  });
});

describe("notion ingestion runs", () => {
  it("should allow only one running run per source within ten minutes", async () => {
    const created = await repo.createNotionSource(
      input("https://www.notion.so/D-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      NOW,
    );

    if (created.kind !== "created") throw new Error("setup");

    const id = created.source.id;
    const [a, b] = await Promise.all([
      runRepo.startNotionRun(id, "manual", NOW),
      runRepo.startNotionRun(id, "manual", NOW),
    ]);

    expect([a, b].filter((r) => r.kind === "started")).toHaveLength(1);

    const afterWindow = new Date(NOW.getTime() + runRepo.RUN_LOCK_WINDOW_MS + 1000);

    expect((await runRepo.startNotionRun(id, "manual", afterWindow)).kind).toBe("started");
  });

  it("should free the source again once a run is finished", async () => {
    const created = await repo.createNotionSource(
      input("https://www.notion.so/E-cccccccccccccccccccccccccccccccc"),
      NOW,
    );

    if (created.kind !== "created") throw new Error("setup");

    const started = await runRepo.startNotionRun(created.source.id, "manual", NOW);

    await runRepo.finishNotionRun(
      started.kind === "started" ? started.runId : "",
      "ok",
      { read: 2, imported: 1, skippedExisting: 1, ignored: 0, removed: 0, removeFailed: 0, truncated: false, pendingAfterLimit: 0 },
      null,
      NOW,
    );

    expect((await runRepo.startNotionRun(created.source.id, "manual", NOW)).kind).toBe("started");

    const view = await repo.getNotionSourceView(created.source.id);

    expect(view?.lastRun).not.toBeNull();
  });

  it("should report a deleted source instead of failing when a run is started for it", async () => {
    expect(await runRepo.startNotionRun("nis_gone", "manual", NOW)).toEqual({ kind: "source_missing" });
  });

  it("should answer duplicate_page when a patch moves a source onto a page that is already added", async () => {
    const other = await repo.createNotionSource(
      input("https://www.notion.so/F-dddddddddddddddddddddddddddddddd"),
      NOW,
    );

    if (other.kind !== "created") throw new Error("setup");

    const moved = await repo.updateNotionSource(other.source.id, { pageUrl: PAGE_A }, NOW);

    expect(moved).toEqual({ kind: "duplicate_page" });
  });
});
