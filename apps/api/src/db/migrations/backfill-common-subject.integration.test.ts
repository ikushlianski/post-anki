import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../assert-local-db-target.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `backfill_common_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: dbUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL(".", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

const sql = readFileSync(new URL("./0104_backfill-common-subject.sql", import.meta.url), "utf8").replaceAll(
  "--> statement-breakpoint",
  "",
);

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: dbUrl.toString() });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

async function subject(id: string, name: string, parentId: string | null) {
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, name, parentId]);
}

async function source(id: string, subjectId: string) {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'x', 'detected', $2)`,
    [id, subjectId],
  );
}

async function subjectOf(id: string): Promise<string> {
  return (await client.query(`SELECT subject_id FROM knowledge_sources WHERE id = $1`, [id])).rows[0].subject_id;
}

describe("backfill of items under subjects that have sub-subjects", () => {
  it("should move items from a parent into its Common sub-subject, keep hand-moved items, and change nothing on a second run", async () => {
    await subject("p1", "Parent", null);
    await subject("c1", "Web", "p1");
    await subject("leaf", "Leaf", null);
    await source("s_parent", "p1");
    await source("s_hand", "c1");
    await source("s_leaf", "leaf");

    await client.query(sql);

    const common = (await client.query(`SELECT id FROM subjects WHERE parent_id = 'p1' AND name = 'Common'`)).rows;

    expect(common).toHaveLength(1);
    expect(await subjectOf("s_parent")).toBe(common[0].id);
    expect(await subjectOf("s_hand")).toBe("c1");
    expect(await subjectOf("s_leaf")).toBe("leaf");

    await client.query(sql);

    expect((await client.query(`SELECT 1 FROM subjects WHERE name = 'Common'`)).rowCount).toBe(1);
    expect(await subjectOf("s_parent")).toBe(common[0].id);
  });

  it("should not create Common for a parent without items", async () => {
    await subject("p2", "Empty parent", null);
    await subject("c2", "Kid", "p2");

    await client.query(sql);

    expect((await client.query(`SELECT 1 FROM subjects WHERE parent_id = 'p2' AND name = 'Common'`)).rowCount).toBe(0);
  });
});
