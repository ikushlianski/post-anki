import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type http from "node:http";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIO 1 (.planning/decide-mode/scenarios.md) — submitDecideSession
// (apps/api/src/decide/decide.orchestrator.ts, per spec.md's Files-touched
// list) calls the UNCHANGED decide agent (AGENT_KEYS.decide,
// decideResultSchema), then persists one decide_sessions row plus one
// decide_blind_spots row per string in the agent's blindSpots array.
//
// On a thrown agent error, OR on result.object == null, both failure
// branches must be indistinguishable from the caller's point of view — same
// thrown error shape, zero rows persisted either way — and the controller
// must map both to HTTP 502 evaluator_unavailable (spec.md's Route design
// section: "both agent-failure branches now return 502 ... unified").
// domain-priority-review.orchestrator.test.ts is the established precedent
// for combining a real-DB orchestrator test with a controller-level
// fake-request/fake-response test in the same file, used here because
// spec.md's Backend DoD requires proof of the actual HTTP status code, which
// a mocked-repo unit test alone cannot produce.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's DoD
// pins the precise command
// `npx vitest run apps/api/src/decide/decide.orchestrator.test.ts
// apps/api/src/decide/decide.repo.test.ts`; vitest.config.ts's exclude list
// carries this filename as a named exception (mirroring
// domain-priority-review.orchestrator.test.ts's own entry) so it doesn't
// leak into the fast, DB-free `npm run test` sweep.
//
// RED right now: apps/api/src/decide/decide.orchestrator.ts and
// decide.repo.ts do not exist (imports fail to resolve), decide_sessions and
// decide_blind_spots don't exist as tables, and decide.controller.ts's
// current handleDecide has neither a submit-and-persist path nor the new
// export name — every assertion below is unreachable until those are built.

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5436/postanki_e2e";

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

assertLocalDbTarget(BASE_DATABASE_URL);

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { decide: "decide" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const dbName = `decide_orchestrator_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

function fakeRequest(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeResponse(): http.ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: "",
    writeHead(status: number) {
      res.statusCode = status;
    },
    end(chunk?: string) {
      res.body = chunk ?? "";
    },
  } as unknown as http.ServerResponse & { statusCode: number; body: string };

  return res;
}

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: BASE_DATABASE_URL });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: testDatabaseUrl });
  const migrateDb = drizzle(migratePool);

  await migrate(migrateDb, {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";
}, 60_000);

afterAll(async () => {
  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
}, 30_000);

describe("submitDecideSession — SCENARIO 1 (successful generate persists session + blind spots)", () => {
  it("inserts one decide_sessions row plus one decide_blind_spots row per blind spot, all status pending", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({
      object: {
        strengths: ["Correctly identifies horizontal scaling as the deciding constraint."],
        blindSpots: [
          "Session revocation on logout is not addressed.",
          "Token size growth under many claims is not addressed.",
        ],
        questions: ["What happens when a compromised token needs to be revoked immediately?"],
        verdict: "Reasonable default, but revocation is unaddressed.",
      },
    });

    const { submitDecideSession } = await import("./decide.orchestrator.js");

    const result = await submitDecideSession(
      "Should we move sessions from JWTs to server-side sessions?",
      "I'd keep JWTs because our API is already stateless and horizontally scaled.",
    );

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe("Should we move sessions from JWTs to server-side sessions?");
    expect(result.verdict).toBe("Reasonable default, but revocation is unaddressed.");
    expect(result.blindSpots).toHaveLength(2);

    for (const blindSpot of result.blindSpots) {
      expect(blindSpot.status).toBe("pending");
      expect(blindSpot.resolvedAt).toBeNull();
      expect(typeof blindSpot.id).toBe("string");
    }

    const { getDb } = await import("../db/client.js");
    const { decideSessions, decideBlindSpots } = await import("../db/schema.js");
    const db = getDb();

    const sessionRows = await db
      .select()
      .from(decideSessions)
      .where(eq(decideSessions.id, result.id));

    expect(sessionRows).toHaveLength(1);

    const blindSpotRows = await db
      .select()
      .from(decideBlindSpots)
      .where(eq(decideBlindSpots.decideSessionId, result.id));

    expect(blindSpotRows).toHaveLength(2);

    for (const row of blindSpotRows) {
      expect(row.status).toBe("pending");
      expect(row.source).toBe("decide");
      expect(row.resolvedAt).toBeNull();
    }
  });

  it("persists the session with zero blind-spot rows when the agent finds none", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({
      object: {
        strengths: ["Sound reasoning throughout."],
        blindSpots: [],
        questions: [],
        verdict: "No real gaps found.",
      },
    });

    const { submitDecideSession } = await import("./decide.orchestrator.js");

    const result = await submitDecideSession(
      "Should we cache this read-only lookup table in memory?",
      "Yes — it's small, rarely changes, and read on every request.",
    );

    expect(result.blindSpots).toEqual([]);

    const { getDb } = await import("../db/client.js");
    const { decideSessions, decideBlindSpots } = await import("../db/schema.js");
    const db = getDb();

    expect(
      await db.select().from(decideSessions).where(eq(decideSessions.id, result.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(decideBlindSpots)
        .where(eq(decideBlindSpots.decideSessionId, result.id)),
    ).toHaveLength(0);
  });
});

describe("submitDecideSession — SCENARIO 1 (both agent-failure branches are unified)", () => {
  it("propagates a rejected agent call as a thrown error, with zero rows inserted", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { submitDecideSession } = await import("./decide.orchestrator.js");
    const { decideSessions } = await import("../db/schema.js");
    const { getDb } = await import("../db/client.js");

    const before = await getDb().select().from(decideSessions);

    await expect(
      submitDecideSession("Decision under agent-throw test", "Opinion under agent-throw test"),
    ).rejects.toThrow();

    const after = await getDb().select().from(decideSessions);
    expect(after).toHaveLength(before.length);
  });

  it("treats a null structured-output response identically to a thrown error — throws, zero rows inserted", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({ object: null });

    const { submitDecideSession } = await import("./decide.orchestrator.js");
    const { decideSessions } = await import("../db/schema.js");
    const { getDb } = await import("../db/client.js");

    const before = await getDb().select().from(decideSessions);

    await expect(
      submitDecideSession("Decision under null-object test", "Opinion under null-object test"),
    ).rejects.toThrow();

    const after = await getDb().select().from(decideSessions);
    expect(after).toHaveLength(before.length);
  });

  it("both failure branches throw the identically-shaped, discriminable error", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { submitDecideSession } = await import("./decide.orchestrator.js");

    let thrownFromAgentError: unknown;

    try {
      await submitDecideSession("Decision A", "Opinion A");
    } catch (err) {
      thrownFromAgentError = err;
    }

    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({ object: null });

    let thrownFromNullObject: unknown;

    try {
      await submitDecideSession("Decision B", "Opinion B");
    } catch (err) {
      thrownFromNullObject = err;
    }

    expect(thrownFromAgentError).toBeInstanceOf(Error);
    expect(thrownFromNullObject).toBeInstanceOf(Error);
    expect((thrownFromAgentError as Error).constructor).toBe(
      (thrownFromNullObject as Error).constructor,
    );
  });

  it("the controller surfaces an agent throw as HTTP 502 evaluator_unavailable, never a silent 200 or 500", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const { handleCreateDecideSession } = await import("./decide.controller.js");

    const req = fakeRequest({ decision: "Controller 502 test — throw", opinion: "some opinion" });
    const res = fakeResponse();

    await handleCreateDecideSession(req, res);

    expect(res.statusCode).toBe(502);

    const parsed = JSON.parse(res.body) as { error: string };
    expect(parsed.error).toBe("evaluator_unavailable");

    const { getDb } = await import("../db/client.js");
    const { decideSessions } = await import("../db/schema.js");

    expect(
      await getDb()
        .select()
        .from(decideSessions)
        .where(eq(decideSessions.decision, "Controller 502 test — throw")),
    ).toHaveLength(0);
  });

  it("the controller surfaces a null structured-output response as the SAME HTTP 502 evaluator_unavailable", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({ object: null });

    const { handleCreateDecideSession } = await import("./decide.controller.js");

    const req = fakeRequest({
      decision: "Controller 502 test — null object",
      opinion: "some opinion",
    });
    const res = fakeResponse();

    await handleCreateDecideSession(req, res);

    expect(res.statusCode).toBe(502);

    const parsed = JSON.parse(res.body) as { error: string };
    expect(parsed.error).toBe("evaluator_unavailable");

    const { getDb } = await import("../db/client.js");
    const { decideSessions } = await import("../db/schema.js");

    expect(
      await getDb()
        .select()
        .from(decideSessions)
        .where(eq(decideSessions.decision, "Controller 502 test — null object")),
    ).toHaveLength(0);
  });
});

describe("submitDecideSession — SCENARIO 4 (whitespace-only input never reaches the agent)", () => {
  it("the controller rejects whitespace-only decision/opinion with 400 before the agent is ever called", async () => {
    mockAgentGenerate.mockClear();

    const { handleCreateDecideSession } = await import("./decide.controller.js");

    const req = fakeRequest({ decision: "   ", opinion: "real opinion" });
    const res = fakeResponse();

    await handleCreateDecideSession(req, res);

    expect(res.statusCode).toBe(400);
    expect(mockAgentGenerate).not.toHaveBeenCalled();

    const { getDb } = await import("../db/client.js");
    const { decideSessions } = await import("../db/schema.js");

    expect(
      await getDb().select().from(decideSessions).where(eq(decideSessions.opinion, "real opinion")),
    ).toHaveLength(0);
  });
});
