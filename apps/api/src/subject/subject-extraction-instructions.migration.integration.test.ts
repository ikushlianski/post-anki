import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EXTRACTION_INSTRUCTIONS_MAX_CHARS } from "@post-anki/shared";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subj_ext_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
const fullFolder = new URL("../db/migrations", import.meta.url).pathname;
const DATA_SUFFIX = "_seed-subject-extraction-instructions";
const dataFile = readdirSync(fullFolder).find((file) => file.endsWith(`${DATA_SUFFIX}.sql`)) ?? "";
const DATA_TAG = dataFile.replace(/\.sql$/, "");
const workDir = mkdtempSync(join(tmpdir(), "subj-ext-"));
const priorFolder = join(workDir, "prior");
const dataStatements = readFileSync(join(fullFolder, dataFile), "utf8").split("--> statement-breakpoint");

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

async function insert(id: string, name: string, parentId: string | null, instructions: string | null = null) {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind, parent_id, extraction_instructions, created_at)
     VALUES ($1, $2, true, 'language-practice', $3, $4, now())`,
    [id, name, parentId, instructions],
  );
}

async function instructionOf(id: string): Promise<string | null> {
  const { rows } = await client.query<{ extraction_instructions: string | null }>(
    `SELECT extraction_instructions FROM subjects WHERE id = $1`,
    [id],
  );

  return rows[0]?.extraction_instructions ?? null;
}

beforeAll(async () => {
  expect(dataFile).not.toBe("");
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

describe("subject extraction instructions data migration", () => {
  it("should give known subjects a card-writing instruction and keep one the learner already wrote", async () => {
    await client.query(`DELETE FROM subjects`);
    await insert("biz", "Business", null);
    await insert("sales", "Sales", "biz", "My own card rules");
    await insert("cold", "Cold sales", "sales");
    await insert("pl", "Polish", null);
    await insert("odd", "Underwater basket weaving", null);
    await rerunDataMigration();

    expect(await instructionOf("sales")).toBe("My own card rules");
    expect(await instructionOf("cold")).toMatch(/channel/);
    expect(await instructionOf("biz")).toMatch(/Cards keep the language of the source/);
    expect(await instructionOf("pl")).toMatch(/Polish/);
    expect(await instructionOf("odd")).toBeNull();
  });

  it("should match nested paths and tech leaves at any depth, not same-named subjects under another parent", async () => {
    await client.query(`DELETE FROM subjects`);
    await insert("prog", "Programming / Web Development", null);
    await insert("db", "Databases", "prog");
    await insert("pol", "Polish", null);
    await insert("fake", "Cold sales", "pol");
    await rerunDataMigration();

    expect(await instructionOf("db")).toMatch(/engine/);
    expect(await instructionOf("fake")).toBeNull();
  });

  it("should keep every seeded text within the instruction limit and change nothing on a second run", async () => {
    await client.query(`DELETE FROM subjects`);
    await insert("biz", "Business", null);
    await insert("neg", "Negotiation", "biz");
    await rerunDataMigration();

    const first = [await instructionOf("biz"), await instructionOf("neg")];

    await rerunDataMigration();

    expect([await instructionOf("biz"), await instructionOf("neg")]).toEqual(first);

    for (const text of first) {
      expect(text?.length ?? 0).toBeGreaterThan(0);
      expect(text?.length ?? 0).toBeLessThanOrEqual(EXTRACTION_INSTRUCTIONS_MAX_CHARS);
    }
  });
});
