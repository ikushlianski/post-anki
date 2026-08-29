import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

// subject-category-nesting — the integration test spec.md named under
// "Files to create" but that never got written in the first implementation
// pass (review.md blocking item). Real Postgres via DATABASE_URL/
// E2E_DATABASE_URL, a dedicated throwaway database per run, same harness
// shape as apps/api/src/probe-session/gap-mastery-concurrency.integration.test.ts
// and apps/api/src/practice/phrase-bank-concurrency.integration.test.ts.
//
// Covers: insertCategory's write path (root + nested + both rejections),
// the two new subject-category endpoints at the controller layer,
// moveCurriculumToSubject's extended atomic move — including a genuine
// concurrent-move proof for the lock-selection fix (curriculum.repo.ts:
// the lock is now chosen from the fresh in-transaction re-read, never the
// pre-transaction peek) — and the reorderCurricula regression review found
// in this fix pass (categorized curricula must not count toward the
// expected id set, since the frontend never sends their ids).

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

const dbName = `subj_cat_${randomUUID().replace(/-/g, "_")}`;
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

const {
  insertCategory,
  listCategoriesForSubject,
  listAllCategories,
} = await import("./subject-category.repo.js");
const {
  handleCreateSubjectCategory,
  handleListSubjectCategories,
  handleListAllSubjectCategories,
} = await import("./subject-category.controller.js");
const { createCurriculum, moveCurriculumToSubject, reorderCurricula } = await import(
  "../curriculum/curriculum.repo.js"
);

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

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedSubject(name: string): Promise<string> {
  const subjectId = id("subj");

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
    subjectId,
    name,
  ]);

  return subjectId;
}

async function seedCurriculum(subjectId: string, categoryId: string | null = null): Promise<string> {
  const curriculumId = id("cur");

  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status, category_id) VALUES ($1, $2, $3, 'confirmed', $4)`,
    [curriculumId, subjectId, "Integration test curriculum", categoryId],
  );

  return curriculumId;
}

function fakeReq(body: unknown): http.IncomingMessage {
  const readable = new Readable({
    read() {
      this.push(JSON.stringify(body));
      this.push(null);
    },
  });

  return readable as unknown as http.IncomingMessage;
}

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

describe("insertCategory — write path", () => {
  it("creates a root category directly under a subject", async () => {
    const subjectId = await seedSubject("RAG-adjacent subject");

    const created = await insertCategory({ subjectId, name: "RAG", parentId: null });

    expect(created).not.toHaveProperty("error");
    if ("error" in created) {
      return;
    }

    expect(created.subjectId).toBe(subjectId);
    expect(created.parentId).toBeNull();

    const listed = await listCategoriesForSubject(subjectId);

    expect(listed.map((c) => c.id)).toContain(created.id);
  });

  it("creates a nested category under an existing category of the same subject", async () => {
    const subjectId = await seedSubject("Nested category subject");
    const parent = await insertCategory({ subjectId, name: "Parent", parentId: null });

    if ("error" in parent) {
      throw new Error("setup failed");
    }

    const child = await insertCategory({ subjectId, name: "Child", parentId: parent.id });

    expect(child).not.toHaveProperty("error");
    if ("error" in child) {
      return;
    }

    expect(child.parentId).toBe(parent.id);
  });

  it("rejects a category under a nonexistent subject, writing nothing", async () => {
    const result = await insertCategory({
      subjectId: "subj_does_not_exist",
      name: "Orphan",
      parentId: null,
    });

    expect(result).toEqual({ error: "subject_not_found" });

    const all = await listAllCategories();

    expect(all.find((c) => c.name === "Orphan")).toBeUndefined();
  });

  it("rejects a parent category that belongs to a different subject, writing nothing", async () => {
    const subjectA = await seedSubject("Subject A");
    const subjectB = await seedSubject("Subject B");
    const parentInA = await insertCategory({ subjectId: subjectA, name: "A-parent", parentId: null });

    if ("error" in parentInA) {
      throw new Error("setup failed");
    }

    const result = await insertCategory({
      subjectId: subjectB,
      name: "Cross-subject child",
      parentId: parentInA.id,
    });

    expect(result).toEqual({ error: "parent_wrong_subject" });

    const listedB = await listCategoriesForSubject(subjectB);

    expect(listedB).toHaveLength(0);
  });

  it("allows duplicate category names under the same parent", async () => {
    const subjectId = await seedSubject("Duplicate-name subject");

    const first = await insertCategory({ subjectId, name: "Same name", parentId: null });
    const second = await insertCategory({ subjectId, name: "Same name", parentId: null });

    expect(first).not.toHaveProperty("error");
    expect(second).not.toHaveProperty("error");
  });
});

describe("subject-category endpoints", () => {
  it("POST /subjects/:id/categories creates a category and returns 201", async () => {
    const subjectId = await seedSubject("Endpoint create subject");
    const req = fakeReq({ name: "Web Theory", parentId: null });
    const res = fakeRes();

    await handleCreateSubjectCategory(req, res, subjectId);

    expect(res.status).toBe(201);
    expect((res.body as { subjectId: string }).subjectId).toBe(subjectId);
  });

  it("POST /subjects/:id/categories returns 404 for a nonexistent subject", async () => {
    const req = fakeReq({ name: "Nope", parentId: null });
    const res = fakeRes();

    await handleCreateSubjectCategory(req, res, "subj_does_not_exist");

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toBe("subject_not_found");
  });

  it("GET /subjects/:id/categories lists only that subject's categories", async () => {
    const subjectA = await seedSubject("Listing subject A");
    const subjectB = await seedSubject("Listing subject B");

    await insertCategory({ subjectId: subjectA, name: "In A", parentId: null });
    await insertCategory({ subjectId: subjectB, name: "In B", parentId: null });

    const res = fakeRes();

    await handleListSubjectCategories(res, subjectA);

    expect(res.status).toBe(200);
    const body = res.body as { subjectId: string; name: string }[];

    expect(body.every((c) => c.subjectId === subjectA)).toBe(true);
    expect(body.some((c) => c.name === "In B")).toBe(false);
  });

  it("GET /subject-categories returns every subject's categories in one flat list", async () => {
    const subjectA = await seedSubject("Flat list subject A");
    const subjectB = await seedSubject("Flat list subject B");

    const inA = await insertCategory({ subjectId: subjectA, name: "Flat A", parentId: null });
    const inB = await insertCategory({ subjectId: subjectB, name: "Flat B", parentId: null });

    if ("error" in inA || "error" in inB) {
      throw new Error("setup failed");
    }

    const res = fakeRes();

    await handleListAllSubjectCategories(res);

    expect(res.status).toBe(200);
    const body = res.body as { id: string }[];
    const ids = body.map((c) => c.id);

    expect(ids).toContain(inA.id);
    expect(ids).toContain(inB.id);
  });
});

describe("moveCurriculumToSubject — extended atomic move", () => {
  it("moves subject and category together in one action (SCENARIO 8)", async () => {
    const subjectA = await seedSubject("Move source subject");
    const subjectB = await seedSubject("Move target subject");
    const categoryB = await insertCategory({ subjectId: subjectB, name: "Target category", parentId: null });

    if ("error" in categoryB) {
      throw new Error("setup failed");
    }

    const curriculumId = await seedCurriculum(subjectA);

    const result = await moveCurriculumToSubject(curriculumId, subjectB, categoryB.id);

    expect(result).not.toHaveProperty("error");

    const { rows } = await client.query(
      `SELECT subject_id, category_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );

    expect(rows[0].subject_id).toBe(subjectB);
    expect(rows[0].category_id).toBe(categoryB.id);
  });

  it("rejects a category that belongs to a different subject, leaving the curriculum untouched (SCENARIO 12)", async () => {
    const subjectA = await seedSubject("Untouched source subject");
    const subjectB = await seedSubject("Real target subject");
    const subjectC = await seedSubject("Category owner subject");
    const categoryC = await insertCategory({ subjectId: subjectC, name: "Wrong subject category", parentId: null });

    if ("error" in categoryC) {
      throw new Error("setup failed");
    }

    const curriculumId = await seedCurriculum(subjectA);

    const result = await moveCurriculumToSubject(curriculumId, subjectB, categoryC.id);

    expect(result).toEqual({ error: "category_wrong_subject" });

    const { rows } = await client.query(
      `SELECT subject_id, category_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );

    expect(rows[0].subject_id).toBe(subjectA);
    expect(rows[0].category_id).toBeNull();
  });

  it("reassigns only the category, leaving the subject unchanged (SCENARIO 9)", async () => {
    const subjectId = await seedSubject("Category-only reassignment subject");
    const categoryOne = await insertCategory({ subjectId, name: "One", parentId: null });
    const categoryTwo = await insertCategory({ subjectId, name: "Two", parentId: null });

    if ("error" in categoryOne || "error" in categoryTwo) {
      throw new Error("setup failed");
    }

    const curriculumId = await seedCurriculum(subjectId, categoryOne.id);

    const result = await moveCurriculumToSubject(curriculumId, subjectId, categoryTwo.id);

    expect(result).not.toHaveProperty("error");

    const { rows } = await client.query(
      `SELECT subject_id, category_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );

    expect(rows[0].subject_id).toBe(subjectId);
    expect(rows[0].category_id).toBe(categoryTwo.id);
  });

  it("moving back to no category (null) is honored explicitly, not treated as a no-op", async () => {
    const subjectId = await seedSubject("Back to root subject");
    const category = await insertCategory({ subjectId, name: "Some category", parentId: null });

    if ("error" in category) {
      throw new Error("setup failed");
    }

    const curriculumId = await seedCurriculum(subjectId, category.id);

    const result = await moveCurriculumToSubject(curriculumId, subjectId, null);

    expect(result).not.toHaveProperty("error");

    const { rows } = await client.query(`SELECT category_id FROM curricula WHERE id = $1`, [
      curriculumId,
    ]);

    expect(rows[0].category_id).toBeNull();
  });

  // Concurrency proof for the peek-lock-verify-retry loop in
  // curriculum.repo.ts's moveCurriculumToSubject (the fix for the
  // lock-selection race: the lock is now chosen off a fresh in-transaction
  // re-read, retrying with the freshly-observed subject if a concurrent
  // write made the initial peek stale, rather than trusting the
  // pre-transaction peek the way the old code did).
  //
  // Honest scope: the (subject_id, category_id) pair can never be torn
  // regardless of locking, because both columns are written by the same
  // single UPDATE statement — Postgres's own row-level atomicity already
  // guarantees that much even with no advisory lock at all. What this test
  // actually proves is the property that IS specific to the fix: under real
  // concurrent contention on the same curriculum, both calls resolve
  // cleanly (no deadlock, no hang, no thrown error), the retry loop
  // converges instead of looping forever or leaving a losing attempt's
  // transaction stuck, and — checked via the follow-up move below — no
  // advisory lock is left held after a losing attempt rolls back. The exact
  // "wrong lock acquired while another operation holds the real current
  // subject's lock" interleaving the bug allowed cannot be forced
  // deterministically from outside the function without a test-only delay
  // hook in production code, which this fix does not add.
  it("two concurrent moves of the same curriculum both resolve cleanly, with no leftover lock", async () => {
    const subjectA = await seedSubject("Race source subject");
    const subjectB = await seedSubject("Race target subject B");
    const subjectC = await seedSubject("Race target subject C");
    const categoryB = await insertCategory({ subjectId: subjectB, name: "B-category", parentId: null });
    const categoryC = await insertCategory({ subjectId: subjectC, name: "C-category", parentId: null });

    if ("error" in categoryB || "error" in categoryC) {
      throw new Error("setup failed");
    }

    const curriculumId = await seedCurriculum(subjectA);

    const [resultB, resultC] = await Promise.all([
      moveCurriculumToSubject(curriculumId, subjectB, categoryB.id),
      moveCurriculumToSubject(curriculumId, subjectC, categoryC.id),
    ]);

    // Both concurrent calls must resolve to a real result, not throw and not
    // deadlock — asserted before any row is inspected, same discipline as
    // gap-mastery-concurrency.integration.test.ts.
    expect(resultB).toBeDefined();
    expect(resultC).toBeDefined();

    const { rows } = await client.query(
      `SELECT subject_id, category_id FROM curricula WHERE id = $1`,
      [curriculumId],
    );
    const finalSubjectId = rows[0].subject_id as string;
    const finalCategoryId = rows[0].category_id as string | null;

    const consistentWithB = finalSubjectId === subjectB && finalCategoryId === categoryB.id;
    const consistentWithC = finalSubjectId === subjectC && finalCategoryId === categoryC.id;

    // Never a torn combination (e.g. subject_id from one call's target paired
    // with category_id from the other's) — exactly one intended move won in
    // full. Postgres's single-UPDATE atomicity already guarantees this much
    // on its own (see the comment above) — kept as a basic sanity check, not
    // the test's real discriminating assertion.
    expect(consistentWithB || consistentWithC).toBe(true);

    // The real discriminating check: a follow-up move immediately after the
    // race must itself resolve promptly and cleanly. If the retry loop or
    // the pair-lock helper ever left a losing attempt's transaction open
    // (lock never released, or the loop spun without terminating), this
    // next call would hang or time out instead of completing.
    const finalTarget = finalSubjectId === subjectB ? subjectC : subjectB;
    const finalTargetCategory = finalSubjectId === subjectB ? categoryC.id : categoryB.id;
    const followUp = await moveCurriculumToSubject(curriculumId, finalTarget, finalTargetCategory);

    expect(followUp).not.toHaveProperty("error");
  }, 30_000);
});

describe("createCurriculum — categoryId on create", () => {
  it("creates a curriculum directly under a category (SCENARIO 4/5)", async () => {
    const subjectId = await seedSubject("Create-with-category subject");
    const category = await insertCategory({ subjectId, name: "Landing category", parentId: null });

    if ("error" in category) {
      throw new Error("setup failed");
    }

    const created = await createCurriculum({
      subjectId,
      name: "Placed curriculum",
      sources: [],
      categoryId: category.id,
    });

    expect(created).not.toHaveProperty("error");
    if ("error" in created) {
      return;
    }

    expect(created.categoryId).toBe(category.id);
  });

  it("rejects a category from a different subject on create, writing nothing (SCENARIO 12)", async () => {
    const subjectA = await seedSubject("Create-reject subject A");
    const subjectB = await seedSubject("Create-reject subject B");
    const categoryB = await insertCategory({ subjectId: subjectB, name: "B category", parentId: null });

    if ("error" in categoryB) {
      throw new Error("setup failed");
    }

    const result = await createCurriculum({
      subjectId: subjectA,
      name: "Should not be created",
      sources: [],
      categoryId: categoryB.id,
    });

    expect(result).toEqual({ error: "category_wrong_subject" });

    const { rows } = await client.query(
      `SELECT * FROM curricula WHERE subject_id = $1 AND name = $2`,
      [subjectA, "Should not be created"],
    );

    expect(rows).toHaveLength(0);
  });
});

describe("reorderCurricula — scoped to uncategorized curricula (SCENARIO 1 regression)", () => {
  // Drag-to-reorder (SubjectSection's DndContext) only ever manages a
  // subject's own uncategorized curricula list — a curriculum filed into a
  // category is rendered under that category, not in this list — so the
  // payload of ordered ids never includes a categorized curriculum's id.
  // Before this fix, reorderCurricula's own expected-id-set read ignored
  // categoryId entirely, so any subject with at least one categorized
  // curriculum rejected every reorder as invalid_id_set.
  it("reorders successfully when the subject also has a categorized curriculum", async () => {
    const subjectId = await seedSubject("Reorder-with-category subject");
    const category = await insertCategory({ subjectId, name: "Filed away", parentId: null });

    if ("error" in category) {
      throw new Error("setup failed");
    }

    const uncategorizedOne = await seedCurriculum(subjectId, null);
    const uncategorizedTwo = await seedCurriculum(subjectId, null);
    await seedCurriculum(subjectId, category.id);

    const result = await reorderCurricula(subjectId, [uncategorizedTwo, uncategorizedOne]);

    expect(result).toEqual({ reordered: 2 });
  });

  it("still rejects a payload that omits or adds an uncategorized curriculum's id", async () => {
    const subjectId = await seedSubject("Reorder-invalid-set subject");
    const uncategorizedOne = await seedCurriculum(subjectId, null);
    await seedCurriculum(subjectId, null);

    const result = await reorderCurricula(subjectId, [uncategorizedOne]);

    expect(result).toEqual({ error: "invalid_id_set" });
  });
});
