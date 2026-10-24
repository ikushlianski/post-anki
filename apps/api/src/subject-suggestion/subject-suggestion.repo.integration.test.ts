import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `subject_suggestion_${randomUUID().replace(/-/g, "_")}`;
const dbUrl = new URL(BASE_DATABASE_URL);

dbUrl.pathname = `/${dbName}`;

const adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });

await adminPool.query(`CREATE DATABASE ${dbName}`);

const migratePool = new pg.Pool({ connectionString: dbUrl.toString() });

await migrate(drizzle(migratePool), {
  migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
  migrationsTable: "drizzle_migrations_api",
});
await migratePool.end();

process.env.DATABASE_URL = dbUrl.toString();
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const repo = await import("./subject-suggestion.repo.js");
const { createSubject } = await import("../subject/subject.repo.js");

afterAll(async () => {
  await closeDb();
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await adminPool.end();
});

function params(name: string, parentSubjectId: string | null = null) {
  return {
    kind: parentSubjectId ? ("sub-subject" as const) : ("new-subject" as const),
    parentSubjectId,
    proposedName: name,
    reason: "cluster of related bits",
    evidenceIds: ["kb_1", "kb_2"],
    evidenceSamples: ["sample"],
    evidenceCount: 2,
  };
}

async function firstPending(name: string) {
  const list = await repo.listSubjectSuggestions("pending");
  const found = list.find((s) => s.proposedName === name);

  if (!found) {
    throw new Error(`no pending suggestion ${name}`);
  }

  return found;
}

describe("subject suggestion store", () => {
  it("should keep one row when two scans suggest the same name at the same time", async () => {
    const results = await Promise.all([
      repo.insertSuggestionIfNew(params("Concurrent Topic")),
      repo.insertSuggestionIfNew(params("Concurrent Topic")),
      repo.insertSuggestionIfNew(params(" concurrent  topic ")),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await repo.countPending("new-subject", null)).toBe(1);
  });

  it("should never bring back a dismissed suggestion on a later scan", async () => {
    await repo.insertSuggestionIfNew(params("Dismiss Me"));

    const s = await firstPending("Dismiss Me");
    const dismissed = await repo.resolveSubjectSuggestion(s.id, { action: "dismiss" });

    expect(dismissed).toMatchObject({ status: "dismissed" });
    expect(await repo.insertSuggestionIfNew(params("Dismiss Me"))).toBe(false);
    expect(await repo.countPending("new-subject")).toBe(1);
  });

  it("should report the last recorded run for the daily check", async () => {
    expect(await repo.getLastRun()).toBeNull();

    await repo.recordRun({ trigger: "daily", calls: 2, created: 1, poolSize: 17 });

    expect(await repo.getLastRun()).toMatchObject({ poolSize: 17 });
  });
});

describe("resolveSubjectSuggestion approve", () => {
  it("should create the subject and answer already_resolved to a second approval", async () => {
    await repo.insertSuggestionIfNew(params("Approved Topic"));

    const s = await firstPending("Approved Topic");
    const first = await repo.resolveSubjectSuggestion(s.id, { action: "approve" });

    expect(first).toMatchObject({ status: "approved", createdSubjectId: expect.any(String) });
    expect(await repo.resolveSubjectSuggestion(s.id, { action: "approve" })).toEqual({
      error: "already_resolved",
    });
  });

  it("should create only one subject when two approvals race", async () => {
    await repo.insertSuggestionIfNew(params("Raced Topic"));

    const s = await firstPending("Raced Topic");
    const results = await Promise.all([
      repo.resolveSubjectSuggestion(s.id, { action: "approve" }),
      repo.resolveSubjectSuggestion(s.id, { action: "approve" }),
    ]);

    expect(results.filter((r) => "error" in r)).toEqual([{ error: "already_resolved" }]);
  });

  it("should use the edited name and refuse a name an existing sibling already has", async () => {
    await createSubject({ name: "Existing Subject", kind: "architecture-mentor" });
    await repo.insertSuggestionIfNew(params("Something Else"));

    const s = await firstPending("Something Else");

    expect(await repo.resolveSubjectSuggestion(s.id, { action: "approve", name: "existing subject" })).toEqual({
      error: "name_taken",
    });
    expect((await firstPending("Something Else")).status).toBe("pending");

    const ok = await repo.resolveSubjectSuggestion(s.id, { action: "approve", name: "Edited Name" });

    expect(ok).toMatchObject({ status: "approved" });
  });

  it("should reject a suggestion whose parent subject no longer exists", async () => {
    await repo.insertSuggestionIfNew(params("Orphan Module", "sub_missing"));

    const s = await firstPending("Orphan Module");

    expect(await repo.resolveSubjectSuggestion(s.id, { action: "approve" })).toEqual({
      error: "parent_not_found",
    });
  });

  it("should create a module under its parent with the parent's kind", async () => {
    const parent = await createSubject({ name: "Lang Parent", kind: "language-practice" });

    await repo.insertSuggestionIfNew(params("Module One", parent.id));

    const s = await firstPending("Module One");
    const result = await repo.resolveSubjectSuggestion(s.id, { action: "approve" });

    expect(result).toMatchObject({ status: "approved" });
  });

  it("should refuse to nest below the depth cap", async () => {
    const l1 = await createSubject({ name: "Depth L1", kind: "architecture-mentor" });
    const l2 = await createSubject({ name: "Depth L2", kind: "architecture-mentor", parentId: l1.id });
    const l3 = await createSubject({ name: "Depth L3", kind: "architecture-mentor", parentId: l2.id });

    await repo.insertSuggestionIfNew(params("Too Deep", l3.id));

    const s = await firstPending("Too Deep");

    expect(await repo.resolveSubjectSuggestion(s.id, { action: "approve" })).toEqual({
      error: "depth_exceeded",
    });
  });

  it("should answer not_found for an unknown id", async () => {
    expect(await repo.resolveSubjectSuggestion("subsug_nope", { action: "dismiss" })).toEqual({
      error: "not_found",
    });
  });
});
