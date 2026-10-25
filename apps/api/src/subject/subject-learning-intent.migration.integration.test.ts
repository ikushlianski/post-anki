import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { BUSINESS_LEARNING_INTENT } from "./subject-learning-intent.js";

const BASE_DATABASE_URL = process.env.DATABASE_URL ?? "";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subj_intent_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
const fullFolder = new URL("../db/migrations", import.meta.url).pathname;
const MIGRATION_TAG = "0112_add-subject-learning-intent";
const workDir = mkdtempSync(join(tmpdir(), "subj-intent-"));
const priorFolder = join(workDir, "prior");

async function migrateFolder(folder: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url.toString() });

  await migrate(drizzle(pool), { migrationsFolder: folder, migrationsTable: "drizzle_migrations_api" });
  await pool.end();
}

afterAll(async () => {
  rmSync(workDir, { recursive: true, force: true });
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

describe("subject learning intent migration", () => {
  it("seeds the Business root intent only and leaves existing intents and other subjects alone", async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    cpSync(fullFolder, priorFolder, { recursive: true });

    const journalPath = join(priorFolder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };

    const cutIndex = journal.entries.findIndex((entry) => entry.tag === MIGRATION_TAG);

    for (const entry of journal.entries.slice(cutIndex)) {
      rmSync(join(priorFolder, `${entry.tag}.sql`));
    }

    journal.entries = journal.entries.slice(0, cutIndex);
    writeFileSync(journalPath, JSON.stringify(journal));
    await migrateFolder(priorFolder);

    const client = new pg.Client({ connectionString: url.toString() });

    await client.connect();

    const insert = (id: string, name: string, parentId: string | null) =>
      client.query(
        `INSERT INTO subjects (id, name, require_sources, kind, parent_id) VALUES ($1, $2, false, 'architecture-mentor', $3)`,
        [id, name, parentId],
      );

    await insert("biz", "Business", null);
    await insert("sales", "Sales", "biz");
    await insert("ai", "AI", null);
    await migrateFolder(fullFolder);

    const { rows } = await client.query<{ id: string; learning_intent: string | null }>(
      `SELECT id, learning_intent FROM subjects ORDER BY id`,
    );

    await client.end();

    expect(Object.fromEntries(rows.map((r) => [r.id, r.learning_intent]))).toEqual({
      ai: null,
      biz: BUSINESS_LEARNING_INTENT,
      sales: null,
    });
  }, 60_000);
});
