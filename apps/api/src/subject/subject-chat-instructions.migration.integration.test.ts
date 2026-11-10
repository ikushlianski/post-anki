import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subj_chat_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
const fullFolder = new URL("../db/migrations", import.meta.url).pathname;
const DATA_TAG = "0158_seed-subject-chat-instructions";
const workDir = mkdtempSync(join(tmpdir(), "subj-chat-"));
const priorFolder = join(workDir, "prior");
const dataSql = readFileSync(join(fullFolder, `${DATA_TAG}.sql`), "utf8");
const dataStatements = dataSql.split("--> statement-breakpoint");

let client: pg.Client;

async function migrateFolder(folder: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url.toString() });

  await migrate(drizzle(pool), { migrationsFolder: folder, migrationsTable: "drizzle_migrations_api" });
  await pool.end();
}

async function rerunDataMigration(): Promise<void> {
  for (const statement of dataStatements) {
    await client.query(statement);
  }
}

async function insert(id: string, name: string, parentId: string | null, chatInstructions: string | null = null) {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind, parent_id, chat_instructions, created_at)
     VALUES ($1, $2, true, 'language-practice', $3, $4, now())`,
    [id, name, parentId, chatInstructions],
  );
}

async function instructionOf(id: string): Promise<string | null> {
  const { rows } = await client.query<{ chat_instructions: string | null }>(
    `SELECT chat_instructions FROM subjects WHERE id = $1`,
    [id],
  );

  return rows[0]?.chat_instructions ?? null;
}

async function clearAll(): Promise<void> {
  await client.query(`DELETE FROM subjects`);
}

async function b2bRows() {
  const { rows } = await client.query<{ id: string; parent_id: string; kind: string; require_sources: boolean }>(
    `SELECT id, parent_id, kind, require_sources FROM subjects WHERE name = 'B2B sales'`,
  );

  return rows;
}

beforeAll(async () => {
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  cpSync(fullFolder, priorFolder, { recursive: true });

  const journalPath = join(priorFolder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const cutIndex = journal.entries.findIndex((entry) => entry.tag === DATA_TAG);

  for (const entry of journal.entries.slice(cutIndex)) {
    rmSync(join(priorFolder, `${entry.tag}.sql`));
  }

  journal.entries = journal.entries.slice(0, cutIndex);
  writeFileSync(journalPath, JSON.stringify(journal));
  await migrateFolder(priorFolder);
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
}, 120_000);

afterAll(async () => {
  await client?.end();
  rmSync(workDir, { recursive: true, force: true });
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

describe("subject chat instructions data migration", () => {
  it("should fill only subjects without an instruction and keep one the learner already wrote", async () => {
    await clearAll();
    await insert("biz", "Business", null);
    await insert("sales", "Sales", "biz", "My own sales persona");
    await insert("cold", "Cold sales", "sales");
    await insert("neg", "Negotiation", "biz");
    await insert("pl", "Polish", null);
    await insert("odd", "Underwater basket weaving", null);
    await rerunDataMigration();

    expect(await instructionOf("sales")).toBe("My own sales persona");
    expect(await instructionOf("cold")).toMatch(/cold sales/);
    expect(await instructionOf("neg")).toMatch(/negotiat/i);
    expect(await instructionOf("biz")).toMatch(/business/);
    expect(await instructionOf("pl")).toMatch(/Polish/);
    expect(await instructionOf("odd")).toBeNull();
  });

  it("should match nested subjects by name path and the tech subjects at any depth", async () => {
    await clearAll();
    await insert("prog", "Programming / Web Development", null);
    await insert("db", "Databases", "prog");
    await insert("pol", "Polish", null);
    await insert("fake", "Cold sales", "pol");
    await rerunDataMigration();

    expect(await instructionOf("db")).toMatch(/databases/);
    expect(await instructionOf("fake")).toBeNull();
  });

  it("should create B2B sales under Sales once, with its own instruction, and do nothing on a second run", async () => {
    await clearAll();
    await insert("biz", "Business", null);
    await insert("sales", "Sales", "biz");
    await client.query(`UPDATE subjects SET sort_order = 3 WHERE id = 'sales'`);
    await insert("cold", "Cold sales", "sales");
    await client.query(`UPDATE subjects SET sort_order = 4 WHERE id = 'cold'`);
    await rerunDataMigration();

    const first = await b2bRows();

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ parent_id: "sales", kind: "language-practice", require_sources: true });
    expect(await instructionOf(first[0]!.id)).toMatch(/B2B/);

    await rerunDataMigration();

    const second = await b2bRows();

    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("should not create B2B sales when there is no Sales under Business", async () => {
    await clearAll();
    await insert("biz", "Business", null);
    await insert("loose", "Sales", null);
    await rerunDataMigration();

    expect(await b2bRows()).toHaveLength(0);
  });
});
