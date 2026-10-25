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
  process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subject_assignment_${randomUUID().replace(/-/g, "_")}`;
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

const { listSourcesAwaitingSubject, recordSubjectSuggestion } = await import("./subject-assignment.repo.js");
const { listPendingKnowledgeBitsForReview } = await import("../knowledge-bit/knowledge-bit-approval.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name) VALUES ('sub_biz', 'Pricing'), ('sub_owner', 'Owner pick')`);
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES
      ('src_free', 'prose', 'anchoring', 'bits_detected', NULL),
      ('src_owner', 'prose', 'owner text', 'bits_detected', 'sub_owner')`,
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body) VALUES
      ('bit_free', 'src_free', 0, 'Anchoring raises prices'),
      ('bit_owner', 'src_owner', 0, 'Owner card')`,
  );
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

describe("subject assignment repo", () => {
  it("should only list unfiled sources that have not been checked yet", async () => {
    const sources = await listSourcesAwaitingSubject(10);

    expect(sources.map((source) => source.id)).toEqual(["src_free"]);
    expect(sources[0]?.cardBodies).toEqual(["Anchoring raises prices"]);
  });

  it("should never overwrite a subject the owner chose", async () => {
    await recordSubjectSuggestion("src_owner", { subjectId: "sub_biz", confidence: "high" });

    const { rows } = await client.query(`SELECT suggested_subject_id FROM knowledge_sources WHERE id = 'src_owner'`);

    expect(rows[0].suggested_subject_id).toBeNull();
  });

  it("should expose the suggestion in the pending review list and stop re-checking the source", async () => {
    await recordSubjectSuggestion("src_free", { subjectId: "sub_biz", confidence: "medium" });

    const pending = await listPendingKnowledgeBitsForReview(50);
    const free = pending.find((entry) => entry.knowledgeSourceId === "src_free");
    const owner = pending.find((entry) => entry.knowledgeSourceId === "src_owner");

    expect(free).toMatchObject({
      suggestedSubjectId: "sub_biz",
      suggestedSubjectName: "Pricing",
      suggestedSubjectConfidence: "medium",
      subjectId: null,
    });
    expect(owner).toMatchObject({ subjectId: "sub_owner", suggestedSubjectId: null, suggestedSubjectConfidence: null });
    expect(await listSourcesAwaitingSubject(10)).toEqual([]);
  });
});
