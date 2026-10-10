import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, describe, expect, it, vi } from "vitest";
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

const dbName = `subject_parent_${randomUUID().replace(/-/g, "_")}`;
const DATABASE_URL = withDatabaseName(BASE_DATABASE_URL, dbName);

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
const repo = await import("./subject.repo.js");
const { handleCreateSubject, handleUpdateSubject } = await import("./subject.controller.js");

afterAll(async () => {
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

function fakeResponse() {
  const res = { status: 0, body: "" as string, writeHead: vi.fn(), end: vi.fn() };

  res.writeHead.mockImplementation((status: number) => {
    res.status = status;
  });
  res.end.mockImplementation((body: string) => {
    res.body = body;
  });

  return res;
}

function jsonRequest(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

async function createTopLevel(name: string) {
  return repo.createSubject({ name, kind: "architecture-mentor" });
}

describe("subject parentId persistence", () => {
  it("should persist a parent when a sub-subject is created with parentId", async () => {
    const parent = await createTopLevel("Programming");

    const child = await repo.createSubject({
      name: "Web",
      kind: "architecture-mentor",
      parentId: parent.id,
    });

    expect((await repo.getSubject(child.id))?.parentId).toBe(parent.id);
  });

  it("should set the parent when PATCH moves a subject under another subject", async () => {
    const parent = await createTopLevel("Cloud");
    const child = await createTopLevel("AWS");

    const result = await repo.updateSubject(child.id, { parentId: parent.id });

    expect(result).toMatchObject({ ok: true, subject: { id: child.id, parentId: parent.id } });
    expect((await repo.getSubject(child.id))?.parentId).toBe(parent.id);
  });

  it("should clear the parent when PATCH sends null", async () => {
    const parent = await createTopLevel("Languages");
    const child = await repo.createSubject({
      name: "Spanish",
      kind: "architecture-mentor",
      parentId: parent.id,
    });

    const result = await repo.updateSubject(child.id, { parentId: null });

    expect(result).toMatchObject({ ok: true, subject: { parentId: null } });
    expect((await repo.getSubject(child.id))?.parentId).toBeNull();
  });

  it("should reject a PATCH that would make a subject its own ancestor", async () => {
    const parent = await createTopLevel("Science");
    const child = await repo.createSubject({
      name: "Physics",
      kind: "architecture-mentor",
      parentId: parent.id,
    });

    const result = await repo.updateSubject(parent.id, { parentId: child.id });

    expect(result).toEqual({ ok: false, error: "invalid_parent" });
    expect((await repo.getSubject(parent.id))?.parentId).toBeNull();
  });

  it("should reject a PATCH that names the subject itself as parent", async () => {
    const subject = await createTopLevel("Self");

    expect(await repo.updateSubject(subject.id, { parentId: subject.id })).toEqual({
      ok: false,
      error: "invalid_parent",
    });
  });

  it("should reject a PATCH whose parent does not exist", async () => {
    const subject = await createTopLevel("Orphan");

    expect(await repo.updateSubject(subject.id, { parentId: "sub_missing" })).toEqual({
      ok: false,
      error: "parent_not_found",
    });
  });
});

describe("subject parentId over HTTP handlers", () => {
  it("should answer 400 parent_not_found when POST names a missing parent", async () => {
    const res = fakeResponse();

    await handleCreateSubject(
      jsonRequest({ name: "Child", kind: "architecture-mentor", parentId: "sub_missing" }),
      res as unknown as http.ServerResponse,
    );

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "parent_not_found" });
  });

  it("should answer 201 with the parent set when POST names an existing parent", async () => {
    const parent = await createTopLevel("Management");
    const res = fakeResponse();

    await handleCreateSubject(
      jsonRequest({ name: "Sales", kind: "architecture-mentor", parentId: parent.id }),
      res as unknown as http.ServerResponse,
    );

    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ name: "Sales", parentId: parent.id });
  });

  it("should answer 400 invalid_parent when PATCH would create a cycle", async () => {
    const parent = await createTopLevel("Arts");
    const child = await repo.createSubject({
      name: "Music",
      kind: "architecture-mentor",
      parentId: parent.id,
    });
    const res = fakeResponse();

    await handleUpdateSubject(
      jsonRequest({ parentId: child.id }),
      res as unknown as http.ServerResponse,
      parent.id,
    );

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: "invalid_parent" });
  });
});
