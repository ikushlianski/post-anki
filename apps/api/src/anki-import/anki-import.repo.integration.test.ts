import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import * as schema from "../db/schema.js";
import {
  countImportNotesByStatus,
  listStagedDecks,
  markNotesImported,
  stageImportNotes,
  takeNextStagedNotes,
} from "./anki-import.repo.js";

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

const dbName = `anki_import_repo_${randomUUID().replace(/-/g, "_")}`;
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const pool = new pg.Pool({ connectionString: withDatabaseName(BASE_DATABASE_URL, dbName) });
const db = drizzle(pool, { schema });

await migrate(drizzle(pool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});

afterAll(async () => {
  await pool.end();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

const rows = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    noteKey: `anki:${String(offset + i).padStart(16, "0")}`,
    deck: i % 2 === 0 ? "Продажи" : "Лояльность",
    rawText: `note ${offset + i}`,
    position: offset + i,
  }));

describe("anki import staging repo", () => {
  it("should add no rows when the same notes are staged twice", async () => {
    const first = await stageImportNotes("imp-twice", rows(5), db);
    const second = await stageImportNotes("imp-twice", rows(5), db);

    expect(first).toBe(5);
    expect(second).toBe(0);
    await expect(countImportNotesByStatus("imp-twice", db)).resolves.toEqual({ staged: 5, imported: 0 });
  });

  it("should stage only the new notes when a larger run follows a small one", async () => {
    await stageImportNotes("imp-grow", rows(3), db);

    await expect(stageImportNotes("imp-grow", rows(6), db)).resolves.toBe(3);
  });

  it("should hand out the next staged notes in file order and skip imported ones", async () => {
    await stageImportNotes("imp-order", [...rows(6)].reverse(), db);
    const firstTwo = await takeNextStagedNotes("imp-order", 2, db);

    await markNotesImported(firstTwo.map((note) => ({ id: note.id, sourceId: `ks_${note.noteKey}` })), db);
    const next = await takeNextStagedNotes("imp-order", 2, db);

    expect(firstTwo.map((note) => note.rawText)).toEqual(["note 0", "note 1"]);
    expect(next.map((note) => note.rawText)).toEqual(["note 2", "note 3"]);
  });

  it("should record the source id and count imported notes", async () => {
    await stageImportNotes("imp-mark", rows(2), db);
    const [first] = await takeNextStagedNotes("imp-mark", 1, db);

    if (!first) throw new Error("expected a staged note");

    await markNotesImported([{ id: first.id, sourceId: "ks_abc" }], db);

    const { rows: stored } = await pool.query(
      `SELECT source_id FROM anki_import_notes WHERE id = $1 AND status = 'imported'`,
      [first.id],
    );

    expect(stored).toEqual([{ source_id: "ks_abc" }]);
    await expect(countImportNotesByStatus("imp-mark", db)).resolves.toEqual({ staged: 1, imported: 1 });
  });

  it("should list only the decks that still have staged notes", async () => {
    await stageImportNotes("imp-decks", rows(2), db);
    const [first] = await takeNextStagedNotes("imp-decks", 1, db);

    if (!first) throw new Error("expected a staged note");

    await markNotesImported([{ id: first.id, sourceId: "ks_x" }], db);

    await expect(listStagedDecks("imp-decks", db)).resolves.toEqual(["Лояльность"]);
  });
});
