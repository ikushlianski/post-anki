import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const SOURCE_URL = process.env.DATABASE_URL ?? "postgres://postanki:postanki@localhost:5562/postgres";

assertLocalDbTarget(SOURCE_URL);

const baseUrl = new URL(SOURCE_URL);

baseUrl.pathname = "/postgres";

const dbName = `card_triage_${randomUUID().replace(/-/g, "_")}`;
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

const runDistiller = vi.fn();

vi.mock("../mastra/card-style-notes-distiller.agent.js", () => ({
  runCardStyleNotesDistiller: (...args: unknown[]) => runDistiller(...args),
}));

const sessionRepo = await import("./card-triage-session.repo.js");
const noteRepo = await import("./card-style-note.repo.js");
const { distillTriageSession } = await import("./card-triage-distill.orchestrator.js");
const { loadStyleNotesBlocksForBits } = await import("./style-notes-loader.js");

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

beforeEach(async () => {
  runDistiller.mockReset();
  await client.query("DELETE FROM card_style_notes");
  await client.query("DELETE FROM card_triage_sessions");
  await client.query("DELETE FROM knowledge_bit_feedback");
});

async function seedFeedback(bitId: string, verdict: string, createdAt = new Date()): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_bit_feedback (id, knowledge_source_id, knowledge_bit_id, verdict, statement, front, created_at)
     VALUES ($1, 'ksrc_x', $2, $3, 'statement', 'front', $4)`,
    [`kbf_${randomUUID()}`, bitId, verdict, createdAt],
  );
}

async function seedBit(subjectId: string | null): Promise<string> {
  const sourceId = `ksrc_${randomUUID()}`;
  const bitId = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id) VALUES ($1, 'prose', 'text', 'pending', $2)`,
    [sourceId, subjectId],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin)
     VALUES ($1, $2, 0, 'body', 'approved', 'extracted')`,
    [bitId, sourceId],
  );

  return bitId;
}

async function openSession(subjectId: string | null = null) {
  return (await sessionRepo.startTriageSession({ subjectId })).session;
}

describe("finishTriageSession (real Postgres)", () => {
  it("should count only the decisions that match a feedback row written during the session", async () => {
    const session = await openSession();

    await seedFeedback("kb_a", "approved");
    await seedFeedback("kb_b", "rejected");
    await seedFeedback("kb_c", "approved");

    const result = await sessionRepo.finishTriageSession(session.id, {
      feedbackText: "",
      decisions: [
        { bitId: "kb_a", verdict: "approved" },
        { bitId: "kb_b", verdict: "rejected" },
        { bitId: "kb_c", verdict: "rejected" },
        { bitId: "kb_unknown", verdict: "approved" },
      ],
    });

    expect(result.status).toBe("ok");

    const row = await sessionRepo.getTriageSessionRow(session.id);

    expect(row).toMatchObject({ acceptedCount: 1, rejectedCount: 1, status: "distilled" });
    expect(row?.endedAt).not.toBeNull();
  });

  it("should ignore feedback written before the session started", async () => {
    await seedFeedback("kb_old", "approved", new Date(Date.now() - 3_600_000));

    const session = await openSession();

    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [{ bitId: "kb_old", verdict: "approved" }] });

    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({ acceptedCount: 0, rejectedCount: 0 });
  });

  it("should refuse to finish the same session twice", async () => {
    const session = await openSession();

    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    await expect(sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] })).resolves.toMatchObject({
      status: "already_finished",
    });
  });

  it("should report an unknown session", async () => {
    await expect(sessionRepo.finishTriageSession("cts_missing", { feedbackText: "", decisions: [] })).resolves.toEqual({
      status: "not_found",
    });
  });

  it("should keep the typed feedback and wait for a retry when the distil call fails", async () => {
    const session = await openSession();

    await sessionRepo.finishTriageSession(session.id, { feedbackText: "Fronts are too long", decisions: [] });
    runDistiller.mockRejectedValue(new Error("budget exceeded"));

    await expect(distillTriageSession(session.id)).resolves.toBe("saved_text_only");

    expect(await sessionRepo.getTriageSessionRow(session.id)).toMatchObject({
      status: "saved_text_only",
      feedbackText: "Fronts are too long",
    });
    expect(await noteRepo.listAllActiveStyleNotes()).toEqual([]);

    runDistiller.mockResolvedValue([{ text: "keep fronts short", scope: "global" }]);

    await expect(distillTriageSession(session.id)).resolves.toBe("distilled");
    expect((await noteRepo.listAllActiveStyleNotes()).map((note) => note.text)).toEqual(["keep fronts short"]);
  });

  it("should not call the model for a session finished without feedback text", async () => {
    const session = await openSession();

    await sessionRepo.finishTriageSession(session.id, { feedbackText: "", decisions: [] });

    await expect(distillTriageSession(session.id)).resolves.toBe("skipped");
    expect(runDistiller).not.toHaveBeenCalled();
  });
});

describe("replaceActiveStyleNotes (real Postgres)", () => {
  it("should supersede the previous active set, keep it as history and activate the new one", async () => {
    const first = await openSession("subj_a");
    const second = await openSession("subj_a");

    await noteRepo.replaceActiveStyleNotes(first.id, "subj_a", [{ text: "old note", subjectId: "subj_a" }]);
    await noteRepo.replaceActiveStyleNotes(second.id, "subj_a", [{ text: "new note", subjectId: "subj_a" }]);

    expect((await noteRepo.listAllActiveStyleNotes()).map((note) => note.text)).toEqual(["new note"]);

    const history = await client.query("SELECT text FROM card_style_notes WHERE superseded_at IS NOT NULL");

    expect(history.rows).toEqual([{ text: "old note" }]);
  });

  it("should leave another subject's notes untouched", async () => {
    const a = await openSession("subj_a");
    const b = await openSession("subj_b");

    await noteRepo.replaceActiveStyleNotes(a.id, "subj_a", [{ text: "note a", subjectId: "subj_a" }]);
    await noteRepo.replaceActiveStyleNotes(b.id, "subj_b", [{ text: "note b", subjectId: "subj_b" }]);

    expect((await noteRepo.listAllActiveStyleNotes()).map((note) => note.text).sort()).toEqual(["note a", "note b"]);
  });

  it("should roll the whole replacement back when an insert fails", async () => {
    const first = await openSession("subj_a");
    const second = await openSession("subj_a");

    await noteRepo.replaceActiveStyleNotes(first.id, "subj_a", [{ text: "keep me", subjectId: "subj_a" }]);

    await expect(
      noteRepo.replaceActiveStyleNotes(second.id, "subj_a", [{ text: null as unknown as string, subjectId: "subj_a" }]),
    ).rejects.toThrow();

    expect((await noteRepo.listAllActiveStyleNotes()).map((note) => note.text)).toEqual(["keep me"]);
  });

  it("should not touch a note the learner switched off", async () => {
    const first = await openSession("subj_a");
    const second = await openSession("subj_a");
    const [note] = await noteRepo.replaceActiveStyleNotes(first.id, "subj_a", [{ text: "off note", subjectId: "subj_a" }]);

    await noteRepo.updateCardStyleNote(note!.id, { enabled: false });
    await noteRepo.replaceActiveStyleNotes(second.id, "subj_a", [{ text: "fresh", subjectId: "subj_a" }]);

    const all = await noteRepo.listAllActiveStyleNotes();

    expect(all.map((entry) => entry.text).sort()).toEqual(["fresh", "off note"]);
  });
});

describe("style note scoping (real Postgres)", () => {
  it("should return global notes plus the asked subject's notes and nothing from other subjects", async () => {
    const session = await openSession();

    await client.query(
      `INSERT INTO card_style_notes (id, subject_id, session_id, text) VALUES
       ('n1', NULL, $1, 'global'), ('n2', 'subj_a', $1, 'for a'), ('n3', 'subj_b', $1, 'for b')`,
      [session.id],
    );

    const forA = await noteRepo.listActiveStyleNotes("subj_a");

    expect(forA.map((note) => note.text).sort()).toEqual(["for a", "global"]);
  });

  it("should give each bit only the block for its own subject and skip disabled notes", async () => {
    const session = await openSession();
    const bitA = await seedBit("subj_a");
    const bitB = await seedBit("subj_b");
    const bitNone = await seedBit(null);

    await client.query(
      `INSERT INTO card_style_notes (id, subject_id, session_id, text, enabled) VALUES
       ('n1', NULL, $1, 'global note', true), ('n2', 'subj_a', $1, 'a only', true),
       ('n3', 'subj_b', $1, 'b only', false)`,
      [session.id],
    );

    const blocks = await loadStyleNotesBlocksForBits([bitA, bitB, bitNone]);

    expect(blocks.get(bitA)).toContain("a only");
    expect(blocks.get(bitA)).toContain("global note");
    expect(blocks.get(bitB)).not.toContain("b only");
    expect(blocks.get(bitNone)).not.toContain("a only");
  });

  it("should map every bit to an empty block when no notes exist", async () => {
    const bit = await seedBit("subj_a");

    expect((await loadStyleNotesBlocksForBits([bit])).size).toBe(0);
  });

  it("should apply a patch to text, switch and scope of one note", async () => {
    const session = await openSession();

    await client.query(`INSERT INTO card_style_notes (id, subject_id, session_id, text) VALUES ('n1', 'subj_a', $1, 'x')`, [session.id]);

    const updated = await noteRepo.updateCardStyleNote("n1", { text: "edited", enabled: false, subjectId: null });

    expect(updated).toMatchObject({ text: "edited", enabled: false, subjectId: null });
    await expect(noteRepo.updateCardStyleNote("missing", { enabled: false })).resolves.toBeNull();
  });
});
