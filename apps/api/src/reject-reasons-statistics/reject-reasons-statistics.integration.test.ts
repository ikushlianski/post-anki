import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `reject_reasons_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
const migrateDb = drizzle(migratePool);

await migrate(migrateDb, {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getRejectReasonsStatistics } = await import("./reject-reasons-statistics.service.js");

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


describe("getRejectReasonsStatistics", () => {
  it("should count live triage rejections and standalone rejected feedback once, skipping undone and approved ones", async () => {
    await client.query(
      `INSERT INTO knowledge_bit_feedback (id, knowledge_source_id, knowledge_bit_id, verdict, reason_code, statement)
       VALUES ('f1','s','b1','rejected','unspecified','x'), ('f2','s','b2','rejected','bad_format','x'),
              ('f3','s','b3','approved',NULL,'x'), ('f4','s','b4','rejected','text_recall_only','x')`,
    );
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, feedback_id, undone_at)
       VALUES ('d1','t','b1','rejected','text_recall_only',0,'f1',NULL),
              ('d2','t','b4','rejected','text_recall_only',1,'f4',now()),
              ('d3','t','b5','rejected',NULL,2,NULL,NULL),
              ('d4','t','b6','approved',NULL,3,NULL,NULL)`,
    );

    const result = await getRejectReasonsStatistics();

    expect(result.total).toBe(3);
    expect(Object.fromEntries(result.reasons.map((r) => [r.reasonCode, r.count]))).toEqual({
      text_recall_only: 1,
      unspecified: 1,
      bad_format: 1,
    });
  });

  it("should bucket live decisions by week with reject rate inputs and skip undone ones", async () => {
    await client.query(
      `UPDATE card_triage_decisions SET undone_at = now() WHERE undone_at IS NULL`,
    );
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, decided_at, undone_at)
       VALUES ('w1','t','b1','rejected','bad_format',0,now(),NULL),
              ('w2','t','b2','approved',NULL,1,now(),NULL),
              ('w3','t','b3','rejected','bad_format',2,now(),now()),
              ('w4','t','b4','rejected','bad_format',3,now() - interval '400 days',NULL)`,
    );

    const result = await getRejectReasonsStatistics();
    const current = result.weekly?.at(-1);

    expect(result.weekly).toHaveLength(12);
    expect(current?.decided).toBe(2);
    expect(current?.rejected).toBe(1);
    expect(current?.rejectRate).toBeCloseTo(0.5);
    expect(current?.topReasons[0]?.reasonCode).toBe("bad_format");
    expect(current?.topReasons[0]?.count).toBe(1);
  });

  it("should group live decisions by the source subject and rank by reject rate", async () => {
    await client.query(`UPDATE card_triage_decisions SET undone_at = now() WHERE undone_at IS NULL`);
    await client.query(
      `INSERT INTO subjects (id, name) VALUES ('sj1','Go'), ('sj2','SQL')`,
    );
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, subject_id) VALUES ('ks1','text','sj1'), ('ks2','text','sj2')`,
    );
    const bits = [1, 2, 3, 4, 5, 6].map((n) => `('sb${n}','${n <= 5 ? "ks1" : "ks2"}',${n},'x')`).join(",");

    await client.query(`INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body) VALUES ${bits}`);
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, undone_at)
       VALUES ('s1','t','sb1','rejected','bad_format',0,NULL), ('s2','t','sb2','rejected','bad_format',1,NULL),
              ('s3','t','sb3','approved',NULL,2,NULL), ('s4','t','sb4','approved',NULL,3,NULL),
              ('s5','t','sb5','approved',NULL,4,NULL), ('s6','t','sb6','rejected','bad_format',5,NULL),
              ('s7','t','sb5','rejected','bad_format',6,now())`,
    );

    const result = await getRejectReasonsStatistics();

    expect(result.bySubject).toEqual([{ subjectName: "Go", decided: 5, rejected: 2, rejectRate: 0.4 }]);
  });
});
