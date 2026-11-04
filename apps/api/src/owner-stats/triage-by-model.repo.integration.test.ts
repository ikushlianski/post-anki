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

const dbName = `triage_by_model_${randomUUID().replace(/-/g, "_")}`;
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

const sessionRepo = await import("../card-triage/card-triage-session.repo.js");
const decisionRepo = await import("../card-triage/card-triage-decision.repo.js");
const { readTriageByModel } = await import("./triage-by-model.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await new Promise((resolve) => setTimeout(resolve, 200));
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

beforeEach(async () => {
  await client.query("DELETE FROM card_triage_decisions");
  await client.query("DELETE FROM card_triage_sessions");
});

async function seedBit(state: "approved" | "rejected", modelIds: string[]): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', 'subj_a')`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin)
     VALUES ($1, $2, 0, 'the body', $3, 'extracted')`,
    [bitId, sourceId, state],
  );

  for (const modelId of modelIds) {
    await client.query(`INSERT INTO knowledge_bit_fusion_models (bit_id, model_id) VALUES ($1, $2)`, [bitId, modelId]);
  }

  return bitId;
}

async function decide(bitId: string, verdict: "approved" | "rejected", sessionId: string): Promise<void> {
  const result = await decisionRepo.putTriageDecision(sessionId, bitId, { verdict });

  expect(result.status).toBe("ok");
}

const now = new Date();

describe("triage decisions keep the producing models (real Postgres)", () => {
  it("should save every model that produced the candidate with the decision", async () => {
    const { session } = await sessionRepo.startTriageSession({ client: "web" });
    const bitId = await seedBit("approved", ["openai/gpt-5", "anthropic/claude-x"]);

    await decide(bitId, "approved", session.id);

    const { rows } = await client.query(`SELECT fusion_model_ids FROM card_triage_decisions`);

    expect(rows[0].fusion_model_ids).toEqual(["anthropic/claude-x", "openai/gpt-5"]);
  });

  it("should leave the model list empty for a candidate not produced by fusion", async () => {
    const { session } = await sessionRepo.startTriageSession({ client: "web" });
    const bitId = await seedBit("approved", []);

    await decide(bitId, "approved", session.id);

    const { rows } = await client.query(`SELECT fusion_model_ids FROM card_triage_decisions`);

    expect(rows[0].fusion_model_ids).toBeNull();
  });
});

describe("readTriageByModel (real Postgres)", () => {
  it("should count kept and rejected decisions per model and skip undone ones", async () => {
    const { session } = await sessionRepo.startTriageSession({ client: "web" });
    const keptShared = await seedBit("approved", ["m/a", "m/b"]);
    const rejectedShared = await seedBit("rejected", ["m/a"]);
    const undone = await seedBit("approved", ["m/b"]);
    const plain = await seedBit("approved", []);

    await decide(keptShared, "approved", session.id);
    await decide(rejectedShared, "rejected", session.id);
    await decide(undone, "approved", session.id);
    await decide(plain, "approved", session.id);
    await decisionRepo.undoTriageDecision(session.id, undone);

    const result = await readTriageByModel({ tz: "UTC", days: 30, now: new Date() });

    expect(result).toEqual([
      { modelId: "m/a", kept: 1, rejected: 1 },
      { modelId: "m/b", kept: 1, rejected: 0 },
    ]);
  });

  it("should leave out decisions older than the window", async () => {
    const { session } = await sessionRepo.startTriageSession({ client: "web" });
    const bitId = await seedBit("approved", ["m/old"]);

    await decide(bitId, "approved", session.id);
    await client.query(`UPDATE card_triage_decisions SET decided_at = now() - interval '40 days'`);

    expect(await readTriageByModel({ tz: "UTC", days: 30, now })).toEqual([]);
  });
});
