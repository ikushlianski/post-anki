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

const dbName = `subject_check_candidates_${randomUUID().replace(/-/g, "_")}`;
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

const { listSubjectCheckCandidateSet } = await import("./knowledge-source-subject-check.candidates.repo.js");

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

async function seedSubject(name: string, parentId: string | null, description: string | null = null): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name, parent_id, description) VALUES ($1, $2, $3, $4)`, [
    id,
    name,
    parentId,
    description,
  ]);

  return id;
}

async function seedBit(subjectId: string, body: string, state: string): Promise<void> {
  const sourceId = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'bits_detected', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, $4)`,
    [`kb_${randomUUID()}`, sourceId, body, state],
  );
}

describe("listSubjectCheckCandidateSet (real Postgres)", () => {
  it("should offer only subjects without children and list parents separately", async () => {
    const business = await seedSubject("Business", null);
    const pricing = await seedSubject("Pricing", business, "How to price products");
    const polish = await seedSubject("Polish", null);

    const set = await listSubjectCheckCandidateSet();
    const candidateIds = set.candidates.map((entry) => entry.id);

    expect(candidateIds).toEqual(expect.arrayContaining([pricing, polish]));
    expect(candidateIds).not.toContain(business);
    expect(set.parents.map((entry) => entry.id)).toContain(business);
    expect(set.candidates.find((entry) => entry.id === pricing)).toMatchObject({
      label: "Business › Pricing",
      description: "How to price products",
      kind: "business",
    });
    expect(set.candidates.find((entry) => entry.id === polish)?.kind).toBe("language");
  });

  it("should sample at most two approved statements from the subject's own cards", async () => {
    const subjectId = await seedSubject("Cooking", null);

    await seedBit(subjectId, "Salt early", "approved");
    await seedBit(subjectId, "Rest the meat", "approved");
    await seedBit(subjectId, "Third approved", "approved");
    await seedBit(subjectId, "Still pending", "pending");

    const set = await listSubjectCheckCandidateSet();
    const samples = set.candidates.find((entry) => entry.id === subjectId)?.samples ?? [];

    expect(samples).toHaveLength(2);
    expect(samples).not.toContain("Still pending");
  });
});
