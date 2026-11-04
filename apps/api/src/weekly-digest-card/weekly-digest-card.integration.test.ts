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

const dbName = `weekly_digest_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const DATABASE_URL = url.toString();
const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

const { getWeeklyDigestCard } = await import("./weekly-digest-card.service.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
}, 30_000);

describe("getWeeklyDigestCard", () => {
  it("should count live decisions and reviews per week and the unsnoozed chat backlog", async () => {
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, order_index, decided_at, undone_at)
       VALUES ('a1','t','b1','approved',0,now() - interval '1 day',NULL),
              ('a2','t','b2','approved',1,now() - interval '2 days',now()),
              ('a3','t','b3','approved',2,now() - interval '9 days',NULL),
              ('r1','t','b4','rejected',3,now() - interval '3 days',NULL),
              ('r2','t','b5','rejected',4,now() - interval '10 days',NULL),
              ('r3','t','b6','rejected',5,now() - interval '40 days',NULL)`,
    );
    await client.query(
      `INSERT INTO knowledge_bit_reviews (id, knowledge_bit_id, variant_id, grade, was_new, reviewed_at, undone_at)
       VALUES ('v1','b1','x','good',false,now() - interval '1 day',NULL),
              ('v2','b1','x','good',false,now() - interval '2 days',NULL),
              ('v3','b1','x','good',false,now() - interval '2 days',now()),
              ('v4','b1','x','good',false,now() - interval '8 days',NULL)`,
    );

    const result = await getWeeklyDigestCard();

    expect(result.current).toEqual({ accepted: 1, rejected: 1, reviewed: 2 });
    expect(result.previous).toEqual({ accepted: 1, rejected: 1, reviewed: 1 });
    expect(result.chatBacklog).toBe(0);
  });

  it("should count distinct chatted cards and successful chat turns in the week from call events", async () => {
    await client.query(
      `INSERT INTO llm_call_events (id, op, agent_key, duration_ms, success, knowledge_bit_id, created_at)
       VALUES ('e1','knowledge_bit_chat_queue_reply','k',1,true,'c1',now() - interval '1 day'),
              ('e2','knowledge_bit_chat_queue_reply','k',1,true,'c1',now() - interval '2 days'),
              ('e3','knowledge_bit_chat_queue_reply','k',1,true,'c2',now() - interval '3 days'),
              ('e4','knowledge_bit_chat_queue_reply','k',1,false,'c3',now() - interval '3 days'),
              ('e5','knowledge_bit_chat_queue_reply','k',1,true,'c4',now() - interval '9 days'),
              ('e6','other_op','k',1,true,'c5',now() - interval '1 day')`,
    );

    const result = await getWeeklyDigestCard();

    expect(result.chatCards).toBe(2);
    expect(result.chatTurns).toBe(3);
  });

  it("should return the top three live reject reasons of the week with null reasons as unspecified", async () => {
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, decided_at, undone_at)
       VALUES ('t1','t','c1','rejected','wrong_language',10,now() - interval '1 day',NULL),
              ('t2','t','c2','rejected','wrong_language',11,now() - interval '2 days',NULL),
              ('t3','t','c3','rejected','wrong_language',12,now() - interval '2 days',now()),
              ('t4','t','c4','rejected',NULL,13,now() - interval '1 day',NULL),
              ('t5','t','c5','rejected',NULL,14,now() - interval '1 day',NULL),
              ('t7','t','c7','rejected','too_vague_or_no_context',16,now() - interval '3 days',NULL),
              ('t8','t','c8','rejected','text_recall_only',17,now() - interval '3 days',NULL),
              ('t9','t','c9','rejected','text_recall_only',18,now() - interval '9 days',NULL)`,
    );

    const result = await getWeeklyDigestCard();

    expect(result.topRejectReasons).toEqual([
      { reason: "unspecified", count: 3, delta: 2 },
      { reason: "wrong_language", count: 2, delta: 2 },
      { reason: "text_recall_only", count: 1, delta: 0 },
    ]);
  });

  it("should report each top reason's change against the previous 7 days, negative when it dropped", async () => {
    await client.query("DELETE FROM card_triage_decisions");
    await client.query(
      `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, decided_at, undone_at)
       VALUES ('d1','t','z1','rejected','wrong_language',10,now() - interval '1 day',NULL),
              ('d2','t','z2','rejected','wrong_language',11,now() - interval '2 days',NULL),
              ('d3','t','z3','rejected','wrong_language',12,now() - interval '9 days',NULL),
              ('d4','t','z4','rejected','wrong_language',13,now() - interval '10 days',NULL),
              ('d5','t','z5','rejected','wrong_language',14,now() - interval '11 days',NULL),
              ('d6','t','z6','rejected','wrong_language',15,now() - interval '12 days',now()),
              ('d7','t','z7','rejected','bad_format',16,now() - interval '1 day',NULL)`,
    );

    const result = await getWeeklyDigestCard();

    expect(result.topRejectReasons).toEqual([
      { reason: "wrong_language", count: 2, delta: -1 },
      { reason: "bad_format", count: 1, delta: 1 },
    ]);
  });

  it("should return no reject reasons for a week without live rejections", async () => {
    const result = await getWeeklyDigestCard(new Date(Date.now() + 100 * 24 * 60 * 60 * 1000));

    expect(result.topRejectReasons).toEqual([]);
  });
});
