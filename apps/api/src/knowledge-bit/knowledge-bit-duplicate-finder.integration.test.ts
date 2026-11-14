import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn().mockRejectedValue(new Error("embeddings unavailable")),
}));

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_bit_duplicates_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
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

const { findLiteralCandidates, findSemanticCandidates } = await import("./knowledge-bit-duplicate-finder.repo.js");
const { findDuplicateCards } = await import("./knowledge-bit-duplicate-finder.js");

let client: pg.Client;
const ids: Record<string, string> = {};

function unitVector(axis: number, tilt = 0): string {
  const values = new Array<number>(1536).fill(0);

  values[axis] = 1;

  if (tilt) {
    values[axis + 1] = tilt;
  }

  return `[${values.join(",")}]`;
}

async function addCard(
  key: string,
  prompt: string,
  answer: string,
  opts: { state?: string; vec?: string; subject?: string } = {},
) {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  ids[key] = id;
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [sourceId, opts.subject ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin) VALUES ($1, $2, 0, $3, $4, 'manual')`,
    [id, sourceId, `${prompt}\n${answer}`, opts.state ?? "approved"],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, card_key, embedding_vec) VALUES ($1, $2, 'basic', 0, $3, $4, $5, $6)`,
    [
      `kbqv_${randomUUID()}`,
      id,
      prompt,
      answer,
      `${prompt.toLowerCase().replace(/[^a-z0-9 ]/g, "")}|${answer.toLowerCase()}`,
      opts.vec ?? null,
    ],
  );
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('s_geo', 'Geo', NULL)`);
  await addCard("capital", "What is the capital of France?", "Paris", { subject: "s_geo", vec: unitVector(0) });
  await addCard("copy", "Please tell me: what is the capital of France? Thanks", "Lyon", { vec: unitVector(5) });
  await addCard("rejected", "What is the capital of France?", "Paris", { state: "rejected" });
  await addCard("near", "France capital city?", "Paris", { vec: unitVector(0, 0.2) });
  await addCard("far", "Largest ocean?", "Pacific", { vec: unitVector(9) });
}, 60_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 60_000);

describe("duplicate finder (real Postgres)", () => {
  it("should find an exact and a near-literal copy by front text, with the subject name, and skip rejected cards", async () => {
    const found = await findLiteralCandidates("What is the capital of France?", "what is the capital of france|paris", 20);

    expect(found.map((c) => c.bitId).sort()).toEqual([ids.capital, ids.copy].sort());
    expect(found.find((c) => c.bitId === ids.capital)?.subjectName).toBe("Geo");
  });

  it("should return only cards whose embedding is at least as similar as the threshold, best first", async () => {
    const found = await findSemanticCandidates(JSON.parse(unitVector(0)) as number[], 0.8, 20);

    expect(found.map((c) => c.bitId)).toEqual([ids.capital, ids.near]);
    expect(found[0]!.similarity).toBeGreaterThan(0.99);
  });

  it("should label the identical card a duplicate and a same-front different-back card possible when embeddings are unavailable", async () => {
    const result = await findDuplicateCards({ front: "What is the capital of France?", back: "Paris" });
    const byId = new Map(result.matches.map((m) => [m.id, m.kind]));

    expect(result.semanticChecked).toBe(false);
    expect(byId.get(ids.capital!)).toBe("duplicate");
    expect(byId.get(ids.copy!)).toBe("possible_duplicate");
    expect(byId.has(ids.rejected!)).toBe(false);
  });
});
