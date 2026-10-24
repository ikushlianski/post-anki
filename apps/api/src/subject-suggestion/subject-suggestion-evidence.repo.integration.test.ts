import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subject_evidence_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: dbUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = dbUrl.toString();
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { getDb } = await import("../db/client.js");
const { knowledgeBits, knowledgeSources, subjects } = await import("../db/schema.js");
const evidence = await import("./subject-suggestion-evidence.repo.js");

afterAll(async () => {
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

async function seedSource(id: string, subjectId: string | null) {
  await getDb().insert(knowledgeSources).values({ id, kind: "text", rawText: "x", subjectId });
}

async function seedBit(
  id: string,
  sourceId: string,
  options: { approved?: boolean; embedding?: number[] | null } = {},
) {
  await getDb()
    .insert(knowledgeBits)
    .values({
      id,
      knowledgeSourceId: sourceId,
      ordinal: Number(id.replace(/\D/g, "")) || 0,
      body: `body ${id}`,
      approvalState: options.approved === false ? "pending" : "approved",
      embedding: options.embedding === undefined ? [1, 0, 0] : options.embedding,
    });
}

describe("subject suggestion evidence repo", () => {
  it("should list only approved, embedded bits with no subject as unplaced", async () => {
    await getDb().insert(subjects).values({ id: "sub_a", name: "A" });
    await seedSource("src_free", null);
    await seedSource("src_filed", "sub_a");
    await seedBit("kb_1", "src_free");
    await seedBit("kb_2", "src_free", { approved: false });
    await seedBit("kb_3", "src_free", { embedding: null });
    await seedBit("kb_4", "src_filed");

    const unplaced = await evidence.listUnplacedApprovedBits(10);

    expect(unplaced.map((bit) => bit.id)).toEqual(["kb_1"]);
  });

  it("should count approved bits per effective subject", async () => {
    const counts = await evidence.countApprovedBitsBySubject();

    expect(counts.get("sub_a")).toBe(1);
    expect(counts.has("null")).toBe(false);
  });

  it("should list a subject's own approved embedded bits", async () => {
    const bits = await evidence.listApprovedBitsForSubject("sub_a", 10);

    expect(bits.map((bit) => bit.id)).toEqual(["kb_4"]);
  });

  it("should expose subjects with their parent and embedding", async () => {
    const list = await evidence.listSubjectsForSuggestion();

    expect(list).toEqual([
      { id: "sub_a", name: "A", description: null, parentId: null, embedding: null },
    ]);
  });
});
