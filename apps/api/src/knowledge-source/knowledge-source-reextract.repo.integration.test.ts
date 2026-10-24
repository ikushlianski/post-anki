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

const dbName = `knowledge_source_reextract_${randomUUID().replace(/-/g, "_")}`;
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

const { claimSourceAndSupersedeAllBits, listReextractCandidates } = await import(
  "./knowledge-source-reextract.repo.js"
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

async function seedSource(status: string, subjectId: string | null = null, rawText: string | null = "text"): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', $2, $3, $4)`,
    [id, rawText, status, subjectId],
  );

  return id;
}

async function seedBit(sourceId: string, ordinal: number, state: string): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, $3, $4, $5)`,
    [id, sourceId, ordinal, `body ${id}`, state],
  );

  return id;
}

async function stateOf(bitId: string): Promise<string> {
  return (await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = $1`, [bitId])).rows[0]
    .approval_state;
}

describe("listReextractCandidates (real Postgres)", () => {
  it("should list finished sources with their live bit counts and honour the subject filter", async () => {
    const subjectId = `subj_${randomUUID()}`;
    const inSubject = await seedSource("bits_detected", subjectId);
    const elsewhere = await seedSource("bits_detected", `subj_${randomUUID()}`);
    const running = await seedSource("processing", subjectId);

    await seedBit(inSubject, 0, "approved");
    await seedBit(inSubject, 1, "pending");
    await seedBit(inSubject, 2, "superseded");
    await seedBit(running, 0, "pending");

    const filtered = await listReextractCandidates({ subjectId });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ id: inSubject, liveBitCount: 2, status: "bits_detected" });

    const all = await listReextractCandidates();

    expect(all.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([inSubject, elsewhere]));
    expect(all.map((candidate) => candidate.id)).not.toContain(running);
  });
});

describe("claimSourceAndSupersedeAllBits (real Postgres)", () => {
  it("should supersede bits in every approval state of that source only and mark it processing", async () => {
    const sourceId = await seedSource("bits_detected");
    const otherId = await seedSource("bits_detected");
    const pending = await seedBit(sourceId, 0, "pending");
    const approved = await seedBit(sourceId, 1, "approved");
    const rejected = await seedBit(sourceId, 2, "rejected");
    const untouched = await seedBit(otherId, 0, "approved");

    const result = await claimSourceAndSupersedeAllBits(sourceId);

    expect(result).toMatchObject({ ok: true, supersededCount: 3, source: { id: sourceId, subjectId: null } });
    expect(await stateOf(pending)).toBe("superseded");
    expect(await stateOf(approved)).toBe("superseded");
    expect(await stateOf(rejected)).toBe("superseded");
    expect(await stateOf(untouched)).toBe("approved");

    const status = (await client.query(`SELECT status FROM knowledge_sources WHERE id = $1`, [sourceId])).rows[0];

    expect(status.status).toBe("processing");
  });

  it("should leave the bits alone when the source is still processing or missing", async () => {
    const running = await seedSource("processing");
    const bit = await seedBit(running, 0, "approved");

    expect(await claimSourceAndSupersedeAllBits(running)).toEqual({ ok: false, error: "not_reextractable" });
    expect(await claimSourceAndSupersedeAllBits("ksrc_missing")).toEqual({ ok: false, error: "not_found" });
    expect(await stateOf(bit)).toBe("approved");
  });
});
