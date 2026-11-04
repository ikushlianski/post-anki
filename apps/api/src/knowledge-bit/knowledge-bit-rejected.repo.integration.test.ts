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
const dbName = `kb_rejected_list_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: DATABASE_URL });
await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";
process.env.DATABASE_URL = DATABASE_URL;
const { listRejectedKnowledgeBits, restoreRejectedOnly } = await import("./knowledge-bit-rejected.repo.js");

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

async function seedBit(id: string, body: string, approvalState = "rejected") {
  await client.query(
    `INSERT INTO knowledge_sources (id, kind) VALUES ($1, 'paste') ON CONFLICT DO NOTHING`,
    [`ks_${id}`],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, $3, $4)`,
    [id, `ks_${id}`, body, approvalState],
  );
}

async function seedDecision(
  id: string,
  bitId: string,
  reason: string | null,
  decidedAt: string,
  options: { undone?: boolean; session?: string } = {},
) {
  await client.query(
    `INSERT INTO card_triage_decisions (id, session_id, knowledge_bit_id, verdict, reason_code, order_index, decided_at, undone_at)
     VALUES ($1, $2, $3, 'rejected', $4, 0, $5, $6)`,
    [id, options.session ?? "s1", bitId, reason, decidedAt, options.undone ? decidedAt : null],
  );
}

describe("listRejectedKnowledgeBits", () => {
  it("should list rejected cards newest first using only the latest live rejection of each card", async () => {
    await seedBit("a", "Card A");
    await seedBit("b", "Card B");
    await seedBit("c", "Card C", "approved");
    await seedBit("d", "Card D");
    await seedDecision("a1", "a", "bad_format", "2026-10-01T00:00:00Z", { session: "s1" });
    await seedDecision("a2", "a", "wrong_language", "2026-10-03T00:00:00Z", { session: "s2" });
    await seedDecision("b1", "b", "text_recall_only", "2026-10-02T00:00:00Z");
    await seedDecision("c1", "c", "other", "2026-10-04T00:00:00Z");
    await seedDecision("d1", "d", "other", "2026-10-05T00:00:00Z", { undone: true });

    const page = await listRejectedKnowledgeBits({ limit: 50, offset: 0 });

    expect(page.items.map((item) => [item.knowledgeBitId, item.reasonCode])).toEqual([
      ["a", "wrong_language"],
      ["b", "text_recall_only"],
    ]);
    expect(page.items[0]?.body).toBe("Card A");
    expect(page.items[0]?.decidedAt).toBe("2026-10-03T00:00:00.000Z");
    expect(page.hasMore).toBe(false);
  });

  it("should filter by reason, treating a missing reason as unspecified", async () => {
    await seedBit("e", "Card E");
    await seedDecision("e1", "e", null, "2026-10-06T00:00:00Z");

    const recall = await listRejectedKnowledgeBits({ reason: "text_recall_only", limit: 50, offset: 0 });
    const unspecified = await listRejectedKnowledgeBits({ reason: "unspecified", limit: 50, offset: 0 });

    expect(recall.items.map((item) => item.knowledgeBitId)).toEqual(["b"]);
    expect(unspecified.items.map((item) => [item.knowledgeBitId, item.reasonCode])).toEqual([["e", "unspecified"]]);
  });

  it("should page with hasMore", async () => {
    const first = await listRejectedKnowledgeBits({ limit: 2, offset: 0 });
    const second = await listRejectedKnowledgeBits({ limit: 2, offset: 2 });

    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });
});

describe("listRejectedKnowledgeBits source", () => {
  it("should expose the first non-blank source line as title and the source URL, nothing for manual cards", async () => {
    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, source_url) VALUES ('ks_src', 'paste', E'\\n  My note title  \\nsecond line', 'https://example.com/n')`,
    );
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ('src1', 'ks_src', 0, 'Sourced card', 'rejected')`,
    );
    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin) VALUES ('src2', 'ks_src', 1, 'Manual card', 'rejected', 'manual')`,
    );
    await seedDecision("src1d", "src1", "other", "2026-10-20T00:00:00Z");
    await seedDecision("src2d", "src2", "other", "2026-10-21T00:00:00Z");

    const page = await listRejectedKnowledgeBits({ q: "card", limit: 50, offset: 0 });
    const byId = new Map(page.items.map((item) => [item.knowledgeBitId, item]));

    expect(byId.get("src1")?.sourceTitle).toBe("My note title");
    expect(byId.get("src1")?.sourceUrl).toBe("https://example.com/n");
    expect(byId.get("src2")?.sourceTitle).toBeNull();
    expect(byId.get("src2")?.sourceUrl).toBeNull();
  });
});

describe("listRejectedKnowledgeBits text search", () => {
  it("should match card text case-insensitively, combine with the reason by AND and treat % and _ literally", async () => {
    await seedBit("s1c", "100% sure about TCP");
    await seedBit("s2c", "Plain tcp_handshake card");
    await seedBit("s3c", "Unrelated 1000 text");
    await seedDecision("s1d", "s1c", "bad_format", "2026-12-01T00:00:00Z");
    await seedDecision("s2d", "s2c", "other", "2026-12-02T00:00:00Z");
    await seedDecision("s3d", "s3c", "bad_format", "2026-12-03T00:00:00Z");

    const ids = async (q: string, reason?: "bad_format" | "other") =>
      (await listRejectedKnowledgeBits({ q, reason, limit: 50, offset: 0 })).items.map((item) => item.knowledgeBitId);

    expect(await ids("TCP")).toEqual(["s2c", "s1c"]);
    expect(await ids("tcp", "bad_format")).toEqual(["s1c"]);
    expect(await ids("100%")).toEqual(["s1c"]);
    expect(await ids("p_h")).toEqual(["s2c"]);
    expect(await ids("%")).toEqual(["s1c"]);
    expect(await ids("nomatch")).toEqual([]);
  });
});

describe("listRejectedKnowledgeBits subject filter", () => {
  async function seedSubjectBit(id: string, subjectId: string, reason: string, decidedAt: string, body = `Card ${id}`) {
    await seedBit(id, body);
    await client.query(`UPDATE knowledge_sources SET subject_id = $1 WHERE id = $2`, [subjectId, `ks_${id}`]);
    await seedDecision(`${id}_d`, id, reason, decidedAt);
  }

  it("should keep only cards of the subject and its sub-subjects, composing with reason and text", async () => {
    await client.query(
      `INSERT INTO subjects (id, name, parent_id) VALUES ('sf_net', 'Net', NULL), ('sf_tcp', 'TCP', 'sf_net'), ('sf_bio', 'Bio', NULL)`,
    );
    await seedSubjectBit("sf1", "sf_net", "other", "2027-01-01T00:00:00Z", "Routing basics");
    await seedSubjectBit("sf2", "sf_tcp", "bad_format", "2027-01-02T00:00:00Z", "Routing over TCP");
    await seedSubjectBit("sf3", "sf_bio", "other", "2027-01-03T00:00:00Z", "Routing of cells");

    const ids = async (extra: Record<string, unknown>) =>
      (await listRejectedKnowledgeBits({ limit: 50, offset: 0, ...extra })).items.map((item) => item.knowledgeBitId);

    expect(await ids({ subjectId: "sf_net" })).toEqual(["sf2", "sf1"]);
    expect(await ids({ subjectId: "sf_tcp" })).toEqual(["sf2"]);
    expect(await ids({ subjectId: "sf_bio" })).toEqual(["sf3"]);
    expect(await ids({ subjectId: "sf_net", reason: "other" })).toEqual(["sf1"]);
    expect(await ids({ subjectId: "sf_net", q: "tcp" })).toEqual(["sf2"]);
    expect(await ids({ subjectId: "sf_bio", reason: "bad_format" })).toEqual([]);
  });

  it("should return nothing for a subject that has no rejected cards", async () => {
    const page = await listRejectedKnowledgeBits({ subjectId: "unknown-subject", limit: 50, offset: 0 });

    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });
});

describe("restoreRejectedOnly", () => {
  it("should return a rejected card to pending, drop it from the list and mark only its latest live rejection undone", async () => {
    await seedBit("r1", "Restore me");
    await seedDecision("r1a", "r1", "bad_format", "2026-11-01T00:00:00Z", { session: "s1" });
    await seedDecision("r1b", "r1", "other", "2026-11-02T00:00:00Z", { session: "s2" });

    expect(await restoreRejectedOnly("r1")).toBe("ok");

    const bit = await client.query(`SELECT approval_state FROM knowledge_bits WHERE id = 'r1'`);
    const decisions = await client.query(
      `SELECT id, undone_at IS NOT NULL AS undone FROM card_triage_decisions WHERE knowledge_bit_id = 'r1' ORDER BY id`,
    );
    const page = await listRejectedKnowledgeBits({ limit: 50, offset: 0 });

    expect(bit.rows[0].approval_state).toBe("pending");
    expect(decisions.rows).toEqual([
      { id: "r1a", undone: false },
      { id: "r1b", undone: true },
    ]);
    expect(page.items.map((item) => item.knowledgeBitId)).not.toContain("r1");
  });

  it("should refuse approved and pending cards without changing them or their decisions", async () => {
    await seedBit("r2", "Approved card", "approved");
    await seedBit("r3", "Pending card", "pending");
    await seedDecision("r2a", "r2", "other", "2026-11-03T00:00:00Z");

    expect(await restoreRejectedOnly("r2")).toBe("not_rejected");
    expect(await restoreRejectedOnly("r3")).toBe("not_rejected");

    const states = await client.query(`SELECT id, approval_state FROM knowledge_bits WHERE id IN ('r2','r3') ORDER BY id`);
    const decision = await client.query(`SELECT undone_at FROM card_triage_decisions WHERE id = 'r2a'`);

    expect(states.rows.map((row) => row.approval_state)).toEqual(["approved", "pending"]);
    expect(decision.rows[0].undone_at).toBeNull();
  });

  it("should report a missing card and refuse a repeated restore", async () => {
    await seedBit("r4", "Second restore");

    expect(await restoreRejectedOnly("missing")).toBe("not_found");
    expect(await restoreRejectedOnly("r4")).toBe("ok");
    expect(await restoreRejectedOnly("r4")).toBe("not_rejected");
  });
});

describe("listRejectedKnowledgeBits reason counts", () => {
  async function seedCounted(id: string, subjectId: string, reason: string | null, decidedAt: string, body: string) {
    await seedBit(id, body);
    await client.query(`UPDATE knowledge_sources SET subject_id = $1 WHERE id = $2`, [subjectId, `ks_${id}`]);
    await seedDecision(`${id}_d`, id, reason, decidedAt);
  }

  it("should count each reason by the latest live rejection within the subject and text filters, ignoring the reason filter", async () => {
    await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('rc_root', 'RC', NULL), ('rc_other', 'RC2', NULL)`);
    await seedCounted("rc1", "rc_root", "other", "2027-03-01T00:00:00Z", "Alpha one");
    await seedCounted("rc2", "rc_root", "other", "2027-03-02T00:00:00Z", "Alpha two");
    await seedCounted("rc3", "rc_root", null, "2027-03-03T00:00:00Z", "Alpha three");
    await seedCounted("rc4", "rc_root", "unspecified", "2027-03-04T00:00:00Z", "Beta four");
    await seedCounted("rc5", "rc_other", "other", "2027-03-05T00:00:00Z", "Alpha five");
    await seedCounted("rc6", "rc_root", "bad_format", "2027-03-06T00:00:00Z", "Alpha six");
    await seedDecision("rc6_new", "rc6", "wrong_language", "2027-03-07T00:00:00Z", { session: "s9" });
    await seedDecision("rc6_undone", "rc6", "other", "2027-03-08T00:00:00Z", { session: "s10", undone: true });

    const all = await listRejectedKnowledgeBits({ subjectId: "rc_root", limit: 50, offset: 0 });
    const filtered = await listRejectedKnowledgeBits({ subjectId: "rc_root", reason: "other", limit: 50, offset: 0 });
    const searched = await listRejectedKnowledgeBits({ subjectId: "rc_root", q: "alpha", limit: 1, offset: 0 });

    expect(all.reasonCounts).toEqual({ other: 2, unspecified: 2, wrong_language: 1 });
    expect(filtered.items).toHaveLength(2);
    expect(filtered.reasonCounts).toEqual(all.reasonCounts);
    expect(searched.reasonCounts).toEqual({ other: 2, unspecified: 1, wrong_language: 1 });
  });
});

describe("listRejectedKnowledgeBits note", () => {
  it("should return the note typed when rejecting and match searches against it", async () => {
    await seedBit("n1", "Plain card one");
    await seedBit("n2", "Plain card two");
    await seedDecision("n1d", "n1", "other", "2027-03-01T00:00:00Z");
    await seedDecision("n2d", "n2", "other", "2027-03-02T00:00:00Z");
    await client.query(`UPDATE card_triage_decisions SET note = 'too vague zebra' WHERE id = 'n1d'`);

    const page = await listRejectedKnowledgeBits({ q: "ZEBRA", limit: 50, offset: 0 });
    const all = await listRejectedKnowledgeBits({ q: "Plain card", limit: 50, offset: 0 });
    const notes = new Map(all.items.map((item) => [item.knowledgeBitId, item.note]));

    expect(page.items.map((item) => [item.knowledgeBitId, item.note])).toEqual([["n1", "too vague zebra"]]);
    expect(notes.get("n2")).toBeNull();
  });
});
