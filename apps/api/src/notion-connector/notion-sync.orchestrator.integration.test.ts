import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { NotionConnector, NotionItem } from "@post-anki/shared";
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

const dbName = `notion_sync_${randomUUID().replace(/-/g, "_")}`;
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

const embedFacts = vi.fn().mockResolvedValue({ embeddedCount: 0, reusedCount: 0, capped: false });

vi.mock("../facts/facts-embedding.orchestrator.js", () => ({
  embedFacts: (...args: unknown[]) => embedFacts(...args),
}));

const { runNotionSync } = await import("./notion-sync.orchestrator.js");

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

const spaConnector: NotionConnector = {
  name: "biz-education-spa",
  source: { kind: "page", id: "page-1" },
  tag: "SPA",
  destination: { kind: "fact" },
  removeAfterImport: false,
  enabled: true,
};

const crmConnector: NotionConnector = {
  name: "inbox-crm",
  source: { kind: "database", id: "db-1" },
  tag: "CRM",
  destination: { kind: "project-todo", file: "/tmp/crm/todo.md", direction: "reading-notes" },
  removeAfterImport: false,
  enabled: true,
};

const EDITED_AT = "2026-10-01T00:00:00.000Z";
const EDITED_LATER = "2026-10-02T00:00:00.000Z";

function deps(items: NotionItem[]) {
  return {
    readItems: vi.fn().mockResolvedValue(items),
    addTodo: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    lastRunAt: vi.fn().mockResolvedValue(null),
    recordRun: vi.fn().mockResolvedValue(undefined),
    now: () => new Date(),
  };
}

async function factBodies(): Promise<string[]> {
  const { rows } = await client.query(`SELECT body FROM facts ORDER BY body`);

  return rows.map((row) => row.body as string);
}

describe("runNotionSync", () => {
  it("turns SPA-tagged notes into facts and ignores untagged ones", async () => {
    const d = deps([
      { id: `b-${randomUUID()}`, text: "Price anchors shape perceived value", tags: ["SPA"], lastEditedTime: EDITED_AT },
      { id: `b-${randomUUID()}`, text: "Untagged musing", tags: [], lastEditedTime: EDITED_AT },
    ]);

    const [result] = await runNotionSync([spaConnector], d);

    expect(result).toEqual({ connector: "biz-education-spa", imported: 1, skipped: 0, failed: 0 });
    expect(await factBodies()).toContain("Price anchors shape perceived value");
    expect(await factBodies()).not.toContain("Untagged musing");
    expect(d.addTodo).not.toHaveBeenCalled();
  });

  it("imports each note only once across repeated runs", async () => {
    const id = `b-${randomUUID()}`;
    const d = deps([{ id, text: "Retention beats acquisition", tags: ["SPA"], lastEditedTime: EDITED_AT }]);

    await runNotionSync([spaConnector], d);
    const [second] = await runNotionSync([spaConnector], d);

    expect(second).toEqual({ connector: "biz-education-spa", imported: 0, skipped: 1, failed: 0 });

    const { rows } = await client.query(`SELECT count(*)::int AS n FROM facts WHERE source_ref = $1`, [
      `notion:${id}`,
    ]);

    expect(rows[0]!.n).toBe(1);
  });

  it("re-syncs a fact when the Notion source was edited after it was first imported", async () => {
    const id = `b-${randomUUID()}`;
    const d = deps([{ id, text: "Original wording", tags: ["SPA"], lastEditedTime: EDITED_AT }]);

    await runNotionSync([spaConnector], d);

    d.readItems.mockResolvedValue([{ id, text: "Edited wording", tags: ["SPA"], lastEditedTime: EDITED_LATER }]);
    const [second] = await runNotionSync([spaConnector], d);

    expect(second).toEqual({ connector: "biz-education-spa", imported: 1, skipped: 0, failed: 0 });
    expect(await factBodies()).toContain("Edited wording");
    expect(await factBodies()).not.toContain("Original wording");
  });

  it("never duplicates a project-todo line when its Notion source is edited", async () => {
    const id = `r-${randomUUID()}`;
    const d = deps([{ id, text: "Original ask", tags: ["CRM"], lastEditedTime: EDITED_AT }]);

    await runNotionSync([crmConnector], d);

    d.readItems.mockResolvedValue([{ id, text: "Edited ask", tags: ["CRM"], lastEditedTime: EDITED_LATER }]);
    const [second] = await runNotionSync([crmConnector], d);

    expect(second).toEqual({ connector: "inbox-crm", imported: 0, skipped: 1, failed: 0 });
    expect(d.addTodo).toHaveBeenCalledTimes(1);
  });

  it("sends CRM-tagged notes to the project backlog and never to facts", async () => {
    const d = deps([
      { id: `r-${randomUUID()}`, text: "Call lost leads within a day", tags: ["crm"], lastEditedTime: EDITED_AT },
    ]);

    const [result] = await runNotionSync([crmConnector], d);

    expect(result?.imported).toBe(1);
    expect(d.addTodo).toHaveBeenCalledWith(
      { file: "/tmp/crm/todo.md", direction: "reading-notes" },
      "Call lost leads within a day",
    );
    expect(await factBodies()).not.toContain("Call lost leads within a day");
  });

  it("keeps going when one note fails and reports the failure", async () => {
    const d = deps([
      { id: `r-${randomUUID()}`, text: "First", tags: ["CRM"], lastEditedTime: EDITED_AT },
      { id: `r-${randomUUID()}`, text: "Second", tags: ["CRM"], lastEditedTime: EDITED_AT },
    ]);
    d.addTodo.mockRejectedValueOnce(new Error("cli down")).mockResolvedValueOnce(undefined);

    const [result] = await runNotionSync([crmConnector], d);

    expect(result).toEqual({ connector: "inbox-crm", imported: 1, skipped: 0, failed: 1 });
  });

  it("removes a note from Notion after import only when the connector says so", async () => {
    const id = `b-${randomUUID()}`;
    const d = deps([{ id, text: "Ship weekly", tags: ["SPA"], lastEditedTime: EDITED_AT }]);

    await runNotionSync([{ ...spaConnector, removeAfterImport: true }], d);

    expect(d.removeItem).toHaveBeenCalledWith(spaConnector.source, id);
  });

  it("embeds facts once every connector has synced", async () => {
    embedFacts.mockClear();
    const d = deps([{ id: `b-${randomUUID()}`, text: "Compounding favours patience", tags: ["SPA"], lastEditedTime: EDITED_AT }]);

    await runNotionSync([spaConnector], d);

    expect(embedFacts).toHaveBeenCalledTimes(1);
  });

  it("still reports a successful sync when embedding the facts fails", async () => {
    embedFacts.mockRejectedValueOnce(new Error("embeddings down"));
    const d = deps([{ id: `b-${randomUUID()}`, text: "Focus is a subtraction exercise", tags: ["SPA"], lastEditedTime: EDITED_AT }]);

    const [result] = await runNotionSync([spaConnector], d);

    expect(result).toEqual({ connector: "biz-education-spa", imported: 1, skipped: 0, failed: 0 });
    expect(await factBodies()).toContain("Focus is a subtraction exercise");
  });
});
