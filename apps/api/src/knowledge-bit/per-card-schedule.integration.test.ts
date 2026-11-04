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

const dbName = `kb_per_card_${randomUUID().replace(/-/g, "_")}`;
const url = new URL(BASE_DATABASE_URL);

url.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: url.toString() });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = url.toString();
process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";
const { recordKnowledgeBitReview } = await import("./knowledge-bit-review.orchestrator.js");
const { undoKnowledgeBitReview } = await import("./knowledge-bit-review-undo.orchestrator.js");
const { updateKnowledgeBitScheduleControls } = await import("./knowledge-bit-review-suspension.orchestrator.js");
const { getKnowledgeBitReviewQueue } = await import("./knowledge-bit-review-queue.repo.js");

let client: pg.Client;

beforeAll(async () => {
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
}, 30_000);

afterAll(async () => {
  await client?.end();
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

const NOW = new Date("2026-10-28T10:00:00.000Z");

async function seedClozeNote(gaps = 3): Promise<{ bitId: string; variantIds: string[] }> {
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'Note body', 'approved')`,
    [bitId, `ks_${randomUUID()}`],
  );

  const variantIds: string[] = [];

  for (let order = 1; order <= gaps; order += 1) {
    const id = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer, sentence) VALUES ($1, $2, 'cloze', $3, $4, 'gap', 'note')`,
      [id, bitId, order, `Gap ${order} prompt`],
    );
    variantIds.push(id);
  }

  return { bitId, variantIds };
}

async function seedBasicNote(): Promise<{ bitId: string; variantId: string }> {
  const bitId = `kb_${randomUUID()}`;
  const variantId = `kbqv_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'Basic', 'approved')`,
    [bitId, `ks_${randomUUID()}`],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q', 'A')`,
    [variantId, bitId],
  );

  return { bitId, variantId };
}

async function scheduleRows(bitId: string) {
  const { rows } = await client.query(
    `SELECT card_key, review_count, phase, buried_until, suspended_at, ease_factor, interval_days FROM knowledge_bit_schedules WHERE knowledge_bit_id = $1 ORDER BY card_key`,
    [bitId],
  );

  return rows;
}

async function grade(variantId: string, g: "again" | "good" | "easy", at: Date, extra: object = {}) {
  const outcome = await recordKnowledgeBitReview({ variantId, grade: g, ...extra }, at);

  if (!outcome.ok) {
    throw new Error("grade failed");
  }

  return outcome;
}

const queueFor = (bitId: string, scoped = false) =>
  getKnowledgeBitReviewQueue(50, scoped ? { knowledgeBitId: bitId } : undefined, { tz: "UTC", now: NOW });

describe("per-card schedules (real Postgres)", () => {
  it("should bury the other gaps until the next local day and report their variant ids", async () => {
    const { bitId, variantIds } = await seedClozeNote();
    const result = await grade(variantIds[0]!, "good", NOW, { tz: "UTC" });
    const rows = await scheduleRows(bitId);

    expect(result.cardKey).toBe("cloze:1");
    expect([...result.buriedVariantIds].sort()).toEqual([variantIds[1], variantIds[2]].sort());
    expect(rows.map((row) => row.card_key)).toEqual(["cloze:1", "cloze:2", "cloze:3"]);
    expect(rows[1].buried_until.toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(rows[1].review_count).toBe(0);
  });

  it("should bury only until local midnight when the learner grades late in the evening", async () => {
    const { bitId, variantIds } = await seedClozeNote();

    await grade(variantIds[0]!, "good", new Date("2026-10-28T22:50:00.000Z"), { tz: "Europe/Warsaw" });

    const rows = await scheduleRows(bitId);

    expect(rows[1].buried_until.toISOString()).toBe("2026-10-28T23:00:00.000Z");
  });

  it("should keep each gap on its own schedule", async () => {
    const { bitId, variantIds } = await seedClozeNote(2);

    await grade(variantIds[0]!, "good", NOW, { burySiblings: false });
    await grade(variantIds[1]!, "easy", new Date(NOW.getTime() + 60_000), { burySiblings: false });

    const [first, second] = await scheduleRows(bitId);

    expect(first.review_count).toBe(1);
    expect(second.review_count).toBe(1);
    expect(first.phase).toBe("learning");
    expect(second.phase).toBe("review");
  });

  it("should hide buried gaps from the queue and the new-card count, and show them again the next day", async () => {
    const { bitId, variantIds } = await seedClozeNote();

    expect((await queueFor(bitId, true)).cards).toHaveLength(3);

    await grade(variantIds[0]!, "good", NOW);

    const queue = await queueFor(bitId, true);

    expect(queue.cards.map((card) => card.variantId)).toEqual([variantIds[0]]);
    expect(queue.counts.new).toBe(0);
    expect(queue.counts.learning).toBe(1);

    const tomorrow = await getKnowledgeBitReviewQueue(
      50,
      { knowledgeBitId: bitId },
      { tz: "UTC", now: new Date("2026-10-29T00:30:00.000Z") },
    );

    expect(tomorrow.cards.map((card) => card.variantId).sort()).toEqual([...variantIds].sort());
    expect(tomorrow.cards.every((card) => card.cardKey?.startsWith("cloze:"))).toBe(true);
  });

  it("should serve every gap of a scoped note back to back when burial is off", async () => {
    const { bitId, variantIds } = await seedClozeNote();

    await grade(variantIds[0]!, "good", NOW, { burySiblings: false });

    expect((await queueFor(bitId, true)).cards.map((card) => card.variantId).sort()).toEqual(
      [...variantIds].sort(),
    );
  });

  it("should never serve two cards of one note while burial is active", async () => {
    const { bitId, variantIds } = await seedClozeNote(4);

    await grade(variantIds[2]!, "good", NOW);

    const queue = await getKnowledgeBitReviewQueue(50, undefined, { tz: "UTC", now: NOW });
    const ofNote = queue.cards.filter((card) => card.knowledgeBitId === bitId);

    expect(ofNote).toHaveLength(1);
  });

  it("should undo only the graded gap and release the siblings that grade buried", async () => {
    const { bitId, variantIds } = await seedClozeNote();
    const graded = await grade(variantIds[0]!, "good", NOW);
    const undone = await undoKnowledgeBitReview(graded.reviewId, new Date(NOW.getTime() + 1000));

    expect(undone).toEqual({
      ok: true,
      knowledgeBitId: bitId,
      variantId: variantIds[0],
      cardKey: "cloze:1",
      unburiedVariantIds: expect.arrayContaining([variantIds[1], variantIds[2]]),
    });

    const rows = await scheduleRows(bitId);

    expect(rows.map((row) => row.card_key)).toEqual(["cloze:1"]);
    expect(rows[0].review_count).toBe(0);
    expect((await queueFor(bitId, true)).cards).toHaveLength(3);
  });

  it("should let a gap be undone after a different gap of the same note was graded in a scoped session", async () => {
    const { variantIds } = await seedClozeNote(2);
    const first = await grade(variantIds[0]!, "good", NOW, { burySiblings: false });

    await grade(variantIds[1]!, "good", new Date(NOW.getTime() + 1000), { burySiblings: false });

    expect((await undoKnowledgeBitReview(first.reviewId, new Date(NOW.getTime() + 2000))).ok).toBe(true);
  });

  it("should refuse to undo a gap that was graded again", async () => {
    const { variantIds } = await seedClozeNote(2);
    const first = await grade(variantIds[0]!, "again", NOW);

    await grade(variantIds[0]!, "good", new Date(NOW.getTime() + 120_000));

    expect(await undoKnowledgeBitReview(first.reviewId)).toEqual({ ok: false, error: "not_latest" });
  });

  it("should keep a sibling unburied by the learner when the first grade is undone", async () => {
    const { bitId, variantIds } = await seedClozeNote();
    const graded = await grade(variantIds[0]!, "good", NOW);

    await client.query(
      `UPDATE knowledge_bit_schedules SET buried_until = NULL WHERE knowledge_bit_id = $1 AND card_key = 'cloze:2'`,
      [bitId],
    );
    await undoKnowledgeBitReview(graded.reviewId, new Date(NOW.getTime() + 1000));

    const rows = await scheduleRows(bitId);

    expect(rows.map((row) => row.card_key)).toContain("cloze:2");
  });

  it("should replay a retried grade without burying or scheduling twice", async () => {
    const { bitId, variantIds } = await seedClozeNote();
    const requestId = randomUUID();
    const first = await grade(variantIds[0]!, "good", NOW, { requestId });
    const again = await grade(variantIds[0]!, "good", new Date(NOW.getTime() + 5000), { requestId });

    expect(again.reviewId).toBe(first.reviewId);
    expect([...again.buriedVariantIds].sort()).toEqual([...first.buriedVariantIds].sort());
    expect((await scheduleRows(bitId))[0].review_count).toBe(1);
  });

  it("should leave basic notes with one schedule and no burial", async () => {
    const { bitId, variantId } = await seedBasicNote();
    const result = await grade(variantId, "good", NOW);

    expect(result.cardKey).toBe("");
    expect(result.buriedVariantIds).toEqual([]);
    expect((await scheduleRows(bitId)).map((row) => row.card_key)).toEqual([""]);
  });

  it("should suspend one gap when the control names its variant and the whole note when it does not", async () => {
    const { bitId, variantIds } = await seedClozeNote();
    const one = await updateKnowledgeBitScheduleControls(bitId, { suspended: true, variantId: variantIds[1], tz: "UTC" }, NOW);

    expect(one).toMatchObject({ ok: true, cardKey: "cloze:2", suspended: true });
    expect((await scheduleRows(bitId)).filter((row) => row.suspended_at)).toHaveLength(1);

    const all = await updateKnowledgeBitScheduleControls(bitId, { suspended: true, tz: "UTC" }, NOW);

    expect(all).toMatchObject({ ok: true, cardKey: null, suspended: true });
    expect((await scheduleRows(bitId)).filter((row) => row.suspended_at)).toHaveLength(3);
    expect(
      await updateKnowledgeBitScheduleControls(bitId, { suspended: true, variantId: "kbqv_other", tz: "UTC" }, NOW),
    ).toEqual({ ok: false, error: "variant_not_found" });
  });
});
