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

const dbName = `card_triage_decisions_${randomUUID().replace(/-/g, "_")}`;
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

const sessionRepo = await import("./card-triage-session.repo.js");
const decisionRepo = await import("./card-triage-decision.repo.js");
const { loadCardFeedback } = await import("./card-triage-distill.orchestrator.js");

let client: pg.Client;

async function waitForSessionsToClose(): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const { rows } = await adminPool.query(`SELECT 1 FROM pg_stat_activity WHERE datname = $1`, [dbName]);

    if (rows.length === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await waitForSessionsToClose();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

beforeEach(async () => {
  await client.query("DELETE FROM card_triage_decisions");
  await client.query("DELETE FROM card_triage_sessions");
  await client.query("DELETE FROM knowledge_bit_feedback");
});

async function seedBit(state: "approved" | "rejected" | "pending" = "approved"): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, extraction_model_id, extraction_run)
     VALUES ($1, 'prose', 'text', 'pending', 'subj_a', 'model-x', 3)`,
    [sourceId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, review_flag)
     VALUES ($1, $2, 0, 'the body', $3, 'extracted', 'long_front')`,
    [bitId, sourceId, state],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
     VALUES ($1, $2, 'wh_question', 0, 'What is TTL?', 'Time to live')`,
    [`kbqv_${randomUUID()}`, bitId],
  );

  return bitId;
}

async function setState(bitId: string, state: string): Promise<void> {
  await client.query(`UPDATE knowledge_bits SET approval_state = $2 WHERE id = $1`, [bitId, state]);
}

async function seedFeedback(bitId: string, verdict: string): Promise<string> {
  const id = `kbf_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bit_feedback (id, knowledge_source_id, knowledge_bit_id, verdict, reason_code, statement, front)
     VALUES ($1, 'ksrc_x', $2, $3, 'unspecified', 'statement', 'front')`,
    [id, bitId, verdict],
  );

  return id;
}

async function openSession() {
  return (await sessionRepo.startTriageSession({ client: "web" })).session;
}

async function rows(sessionId: string) {
  return (await client.query(`SELECT * FROM card_triage_decisions WHERE session_id = $1 ORDER BY order_index`, [sessionId]))
    .rows;
}

describe("session start and end (real Postgres)", () => {
  it("should never create a second session when a start is retried with the same key", async () => {
    const first = await sessionRepo.startTriageSession({ client: "ios", startKey: "key-1" });
    const second = await sessionRepo.startTriageSession({ client: "ios", startKey: "key-1" });

    expect([first.created, second.created]).toEqual([true, false]);
    expect(second.session.id).toBe(first.session.id);
    expect((await client.query("SELECT 1 FROM card_triage_sessions")).rowCount).toBe(1);
  });

  it("should close a session finished with nothing decided and record the cards left undecided", async () => {
    const session = await openSession();
    const result = await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [], undecidedCount: 7 });

    expect(result.status).toBe("ok");
    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({
      status: "distilled",
      endedBy: "user",
      undecidedCount: 7,
      acceptedCount: 0,
      rejectedCount: 0,
    });
  });

  it("should record a discard as ended by discard and answer a repeat with the stored session", async () => {
    const session = await openSession();
    const first = await sessionRepo.discardTriageSession(session.id, { undecidedCount: 2 });
    const second = await sessionRepo.discardTriageSession(session.id, {});

    expect(first.status).toBe("ok");
    expect(second).toMatchObject({ status: "already_finished", session: { status: "discarded" } });
    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({
      status: "discarded",
      endedBy: "discarded",
      undecidedCount: 2,
    });
  });

  it("should leave a finished session unchanged when finish is repeated", async () => {
    const session = await openSession();

    await sessionRepo.finishTriageSession(session.id, { feedbackText: "short fronts", decisions: [] });

    const again = await sessionRepo.finishTriageSession(session.id, { feedbackText: "other", decisions: [] });

    expect(again).toMatchObject({ status: "already_finished", session: { feedbackText: "short fronts" } });
  });
});

describe("putTriageDecision (real Postgres)", () => {
  it("should keep where a rejected card came from and its text, reason and note in the session record", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");
    const feedbackId = await seedFeedback(bitId, "rejected");
    const result = await decisionRepo.putTriageDecision(session.id, bitId, {
      verdict: "rejected",
      reasonCode: "bad_format",
      note: "odd blank",
      dwellMs: 2500,
    });

    expect(result.status).toBe("ok");

    const [row] = await rows(session.id);

    expect(row).toMatchObject({
      verdict: "rejected",
      reason_code: "bad_format",
      note: "odd blank",
      dwell_ms: 2500,
      order_index: 0,
      subject_id: "subj_a",
      extraction_model_id: "model-x",
      extraction_run: 3,
      review_flag: "long_front",
      front: "What is TTL?",
      back: "Time to live",
      source: "client",
      feedback_id: feedbackId,
    });
    expect(row.variants).toEqual([expect.objectContaining({ kind: "wh_question", kept: true })]);

    const legacy = await client.query(`SELECT reason_code, note FROM knowledge_bit_feedback WHERE id = $1`, [feedbackId]);

    expect(legacy.rows[0]).toEqual({ reason_code: "bad_format", note: "odd blank" });
  });

  it("should number decisions in order and measure the time since the previous one", async () => {
    const session = await openSession();
    const bits = [await seedBit(), await seedBit(), await seedBit()];

    for (const bitId of bits) {
      await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "approved" });
    }

    const stored = await rows(session.id);

    expect(stored.map((row) => row.order_index)).toEqual([0, 1, 2]);
    expect(stored.every((row) => row.ms_since_previous >= 0)).toBe(true);
  });

  it("should only update the note and reason when the same verdict is sent again", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", dwellMs: 900 });
    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", note: "later thought", reasonCode: "other" });

    const stored = await rows(session.id);

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ note: "later thought", reason_code: "other", dwell_ms: 900 });
  });

  it("should create a new row and mark the old one undone when the verdict changes", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", note: "no" });
    await setState(bitId, "approved");
    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "approved" });

    const stored = await rows(session.id);

    expect(stored.map((row) => [row.verdict, row.undone_at !== null])).toEqual([
      ["rejected", true],
      ["approved", false],
    ]);
    expect(stored[0]?.note).toBe("no");
  });

  it("should keep the row, with its reason, after an undo", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", reasonCode: "meta_wording", note: "x" });

    const undone = await decisionRepo.undoTriageDecision(session.id, bitId);
    const stored = await rows(session.id);

    expect(undone.status).toBe("ok");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ reason_code: "meta_wording", note: "x" });
    expect(stored[0]?.undone_at).not.toBeNull();
    expect(await decisionRepo.listTriageDecisions(session.id)).toHaveLength(0);
    expect(await decisionRepo.listTriageDecisions(session.id, { includeUndone: true })).toHaveLength(1);
    await expect(decisionRepo.undoTriageDecision(session.id, bitId)).resolves.toEqual({ status: "decision_not_found" });
  });

  it("should not record a decision the card does not actually have", async () => {
    const session = await openSession();
    const pending = await seedBit("pending");
    const approved = await seedBit("approved");

    await expect(decisionRepo.putTriageDecision(session.id, pending, { verdict: "approved" })).resolves.toEqual({
      status: "decision_not_applied",
    });
    await expect(decisionRepo.putTriageDecision(session.id, approved, { verdict: "rejected" })).resolves.toEqual({
      status: "decision_not_applied",
    });
    await expect(decisionRepo.putTriageDecision(session.id, "kb_missing", { verdict: "approved" })).resolves.toEqual({
      status: "bit_not_found",
    });
    await expect(decisionRepo.putTriageDecision("cts_missing", approved, { verdict: "approved" })).resolves.toEqual({
      status: "session_not_found",
    });
    expect(await rows(session.id)).toHaveLength(0);
  });

  it("should refuse to edit or undo a decision after the session is finished", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected" });
    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    await expect(decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", note: "late" })).resolves.toEqual({
      status: "session_finished",
    });
    await expect(decisionRepo.undoTriageDecision(session.id, bitId)).resolves.toEqual({ status: "session_finished" });
    expect((await rows(session.id))[0]?.note).toBeNull();
  });
});

describe("finishTriageSession counts and reconcile (real Postgres)", () => {
  it("should not count an undone decision", async () => {
    const session = await openSession();
    const kept = await seedBit("approved");
    const undone = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, kept, { verdict: "approved" });
    await decisionRepo.putTriageDecision(session.id, undone, { verdict: "rejected" });
    await decisionRepo.undoTriageDecision(session.id, undone);
    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({ acceptedCount: 1, rejectedCount: 0 });
  });

  it("should drop a live row whose card is no longer in that state when the session finishes", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected" });
    await setState(bitId, "pending");
    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({ rejectedCount: 0 });
  });

  it("should still produce decision rows for an old app build that only sends decisions at finish", async () => {
    const session = await openSession();
    const approved = await seedBit("approved");
    const rejected = await seedBit("rejected");

    await seedFeedback(approved, "approved");
    await seedFeedback(rejected, "rejected");
    await sessionRepo.finishTriageSession(session.id, {
      feedbackText: "",
      decisions: [
        { bitId: approved, verdict: "approved" },
        { bitId: rejected, verdict: "rejected", note: "too vague" },
        { bitId: "kb_unknown", verdict: "approved" },
      ],
    });

    const stored = await rows(session.id);

    expect(stored.map((row) => [row.verdict, row.source])).toEqual([
      ["approved", "reconciled"],
      ["rejected", "reconciled"],
    ]);
    expect(stored[1]).toMatchObject({ note: "too vague", front: "What is TTL?", extraction_model_id: "model-x" });
    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 1,
      status: "saved_text_only",
    });
  });

  it("should fill a missing note from the finish payload without creating a second row", async () => {
    const session = await openSession();
    const bitId = await seedBit("rejected");

    await seedFeedback(bitId, "rejected");
    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected" });
    await sessionRepo.finishTriageSession(session.id, {
      feedbackText: "",
      decisions: [{ bitId, verdict: "rejected", note: "from payload" }],
    });

    const stored = await rows(session.id);

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ note: "from payload", source: "client" });
  });

  it("should leave a session without text or card feedback as distilled so no model call is made", async () => {
    const session = await openSession();
    const bitId = await seedBit("approved");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "approved" });
    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    expect((await sessionRepo.getTriageSessionRow(session.id))?.status).toBe("distilled");
  });

  it("should keep a session waiting for the model when only a per-card note exists", async () => {
    const session = await openSession();
    const bitId = await seedBit("approved");

    await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "approved", note: "nice and short" });
    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    expect((await sessionRepo.getTriageSessionRow(session.id))?.status).toBe("saved_text_only");
  });
});

describe("loadCardFeedback (real Postgres)", () => {
  it("should hand the model at most 20 live items with rejected cards first and skip undone and empty ones", async () => {
    const session = await openSession();
    const approvedBit = await seedBit("approved");

    await decisionRepo.putTriageDecision(session.id, approvedBit, { verdict: "approved", note: "good" });

    for (let index = 0; index < 22; index += 1) {
      const bitId = await seedBit("rejected");

      await decisionRepo.putTriageDecision(session.id, bitId, { verdict: "rejected", reasonCode: "bad_format" });
    }

    const undoneBit = await seedBit("rejected");
    const silentBit = await seedBit("approved");

    await decisionRepo.putTriageDecision(session.id, undoneBit, { verdict: "rejected", note: "gone" });
    await decisionRepo.undoTriageDecision(session.id, undoneBit);
    await decisionRepo.putTriageDecision(session.id, silentBit, { verdict: "approved" });

    const items = await loadCardFeedback(session.id);

    expect(items).toHaveLength(20);
    expect(items.every((item) => item.verdict === "rejected")).toBe(true);
    expect(items.some((item) => item.note === "gone")).toBe(false);
  });
});
