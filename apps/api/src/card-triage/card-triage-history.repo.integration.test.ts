import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const SOURCE_URL = process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";

assertLocalDbTarget(SOURCE_URL);

const baseUrl = new URL(SOURCE_URL);

baseUrl.pathname = "/postgres";

const dbName = `triage_history_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(baseUrl.toString());

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
const adminPool = new pg.Pool({ connectionString: baseUrl.toString() });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = DATABASE_URL;
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const historyRepo = await import("./card-triage-history.repo.js");
const patchRepo = await import("./card-triage-decision-patch.repo.js");

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
});

beforeEach(async () => {
  await client.query("DELETE FROM card_triage_decisions");
});

async function seedDecision(input: { front: string; ageDays: number; undone?: boolean; reason?: string }): Promise<string> {
  const id = `ctd_${randomUUID()}`;

  await client.query(
    `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, decided_at, order_index, front, back, undone_at)
     VALUES ($1, 'cts_1', $2, 'rejected', $3, now() - ($4 || ' days')::interval, 0, $5, 'back', $6)`,
    [id, `kb_${randomUUID()}`, input.reason ?? null, String(input.ageDays), input.front, input.undone ? new Date() : null],
  );

  return id;
}

describe("triage history query (real Postgres)", () => {
  it("should return only live decisions from inside the window, newest first", async () => {
    const older = await seedDecision({ front: "older card", ageDays: 3 });
    const newer = await seedDecision({ front: "newer card", ageDays: 1 });

    await seedDecision({ front: "too old", ageDays: 9 });
    await seedDecision({ front: "undone", ageDays: 1, undone: true });

    const rows = await historyRepo.listRecentTriageDecisions(new Date(Date.now() - 7 * 86_400_000), "");

    expect(rows.map((row) => row.id)).toEqual([newer, older]);
  });

  it("should flag text matches case-insensitively and treat percent signs literally", async () => {
    await seedDecision({ front: "Kubernetes pods", ageDays: 1 });
    await seedDecision({ front: "100% sure", ageDays: 1 });

    const since = new Date(Date.now() - 7 * 86_400_000);
    const kube = await historyRepo.listRecentTriageDecisions(since, "kubernetes");
    const percent = await historyRepo.listRecentTriageDecisions(since, "%");

    expect(kube.filter((row) => row.textMatch).map((row) => row.front)).toEqual(["Kubernetes pods"]);
    expect(percent.filter((row) => row.textMatch).map((row) => row.front)).toEqual(["100% sure"]);
  });

  it("should set and then clear the reason on a decision after the fact", async () => {
    const id = await seedDecision({ front: "card", ageDays: 1 });

    expect((await patchRepo.patchTriageDecisionDetails(id, { reasonCode: "too_vague_or_no_context" }))?.reasonCode).toBe("too_vague_or_no_context");
    expect((await patchRepo.patchTriageDecisionDetails(id, { reasonCode: null }))?.reasonCode).toBeNull();
    expect(await patchRepo.patchTriageDecisionDetails("ctd_missing", { reasonCode: null })).toBeNull();
  });
});
