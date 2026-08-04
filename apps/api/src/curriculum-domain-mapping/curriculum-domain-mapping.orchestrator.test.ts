import { randomUUID } from "node:crypto";
import type http from "node:http";
import { Readable } from "node:stream";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// SCENARIOS 1, 6, 7, 11 (.planning/decouple-curricula-from-domain-nodes/scenarios.md).
//
// The DoD's own required proof: "drops any AI-suggested node id not present
// in the subject's real tree, and never calls insertDomainNode." Touches a
// real, freshly-migrated throwaway Postgres (same pattern as
// domain-priority-review.orchestrator.test.ts) rather than mocking the repo
// layer — only the mastra agent call is mocked.

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
  AGENT_KEYS: {
    domainTaxonomyMapping: "domainTaxonomyMapping",
  },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

const dbName = `cdm_orchestrator_${randomUUID().replace(/-/g, "_")}`;
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

async function seedTaxonomySubjectWithCurriculum(): Promise<{
  subjectId: string;
  curriculumId: string;
  frontendId: string;
  reactId: string;
}> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes, curricula, modules, topics } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const frontendId = newId("dnode");
  const reactId = newId("dnode");
  const curriculumId = newId("cur");
  const moduleId = newId("mod");

  await db.insert(subjects).values({ id: subjectId, name: `E2E CDM Subject ${subjectId}` });
  await db.insert(domainNodes).values([
    { id: frontendId, subjectId, parentId: null, name: "Frontend", order: 0, source: "static_taxonomy" },
    { id: reactId, subjectId, parentId: frontendId, name: "React", order: 0, source: "static_taxonomy" },
  ]);
  await db.insert(curricula).values({ id: curriculumId, subjectId, name: "React Fundamentals" });
  await db.insert(modules).values({ id: moduleId, curriculumId, title: "Module", order: 0 });
  await db.insert(topics).values({
    id: newId("top"),
    moduleId,
    curriculumId,
    title: "Hooks and state",
    order: 0,
  });

  return { subjectId, curriculumId, frontendId, reactId };
}

async function seedNonTaxonomySubjectWithCurriculum(): Promise<{
  subjectId: string;
  curriculumId: string;
}> {
  const { getDb } = await import("../db/client.js");
  const { subjects, curricula } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const curriculumId = newId("cur");

  await db.insert(subjects).values({ id: subjectId, name: `E2E Non-Taxonomy Subject ${subjectId}` });
  await db.insert(curricula).values({ id: curriculumId, subjectId, name: "Business Basics" });

  return { subjectId, curriculumId };
}

describe("triggerCurriculumDomainMapping — SCENARIO 1 (confident matches produce suggested rows)", () => {
  it("inserts one suggested row per confidently matched node, calls the agent exactly once", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedTaxonomySubjectWithCurriculum();

    mockAgentGenerate.mockResolvedValue({
      object: {
        matches: [{ nodeId: seeded.reactId, depth: "working" }],
        unmatchedTopics: [],
      },
    });

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = await triggerCurriculumDomainMapping(seeded.curriculumId);

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
    expect("error" in (result as object)).toBe(false);

    const rows = result as Array<{ domainNodeId: string; status: string; depth: string | null }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.domainNodeId).toBe(seeded.reactId);
    expect(rows[0]!.status).toBe("suggested");
    expect(rows[0]!.depth).toBe("working");
  });
});

describe("triggerCurriculumDomainMapping — SCENARIO 6 (no confident match anywhere)", () => {
  it("returns an empty list, not an error, when the agent finds nothing confidently", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const seeded = await seedTaxonomySubjectWithCurriculum();

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = await triggerCurriculumDomainMapping(seeded.curriculumId);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });
});

describe("triggerCurriculumDomainMapping — SCENARIO 7 (unmatched topic files a domain_topic_suggestion, never a direct node)", () => {
  it("inserts a domain_topic_suggestion row for an unmatched topic and never calls insertDomainNode", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedTaxonomySubjectWithCurriculum();

    mockAgentGenerate.mockResolvedValue({
      object: {
        matches: [],
        unmatchedTopics: ["Quantum-Resistant Cryptography"],
      },
    });

    const { getDb } = await import("../db/client.js");
    const { domainNodes, domainTopicSuggestions } = await import("../db/schema.js");
    const db = getDb();

    const nodeCountBefore = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, seeded.subjectId))
    ).length;

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    await triggerCurriculumDomainMapping(seeded.curriculumId);

    const nodeCountAfter = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, seeded.subjectId))
    ).length;

    // The real proof that insertDomainNode was never called anywhere in
    // this orchestrator: the node count for this subject is byte-identical
    // before and after.
    expect(nodeCountAfter).toBe(nodeCountBefore);

    const suggestionRows = await db
      .select()
      .from(domainTopicSuggestions)
      .where(eq(domainTopicSuggestions.subjectId, seeded.subjectId));

    expect(suggestionRows).toHaveLength(1);
    expect(suggestionRows[0]!.proposedNodeName).toBe("Quantum-Resistant Cryptography");
    expect(suggestionRows[0]!.status).toBe("pending");
  });
});

describe("triggerCurriculumDomainMapping — the DoD's required test case: hallucinated node ids are dropped", () => {
  it("drops any AI-suggested node id not present in the subject's real tree, and never calls insertDomainNode", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedTaxonomySubjectWithCurriculum();

    mockAgentGenerate.mockResolvedValue({
      object: {
        matches: [
          { nodeId: seeded.reactId, depth: "working" },
          { nodeId: "dnode_hallucinated_by_the_agent", depth: "deep" },
        ],
        unmatchedTopics: [],
      },
    });

    const { getDb } = await import("../db/client.js");
    const { domainNodes, curriculumDomainNodeMappings } = await import("../db/schema.js");
    const db = getDb();

    const nodeCountBefore = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, seeded.subjectId))
    ).length;

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = await triggerCurriculumDomainMapping(seeded.curriculumId);

    const nodeCountAfter = (
      await db.select().from(domainNodes).where(eq(domainNodes.subjectId, seeded.subjectId))
    ).length;

    // No node was ever created for the hallucinated id — insertDomainNode
    // was never called anywhere in this orchestrator.
    expect(nodeCountAfter).toBe(nodeCountBefore);

    const rows = result as Array<{ domainNodeId: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.domainNodeId).toBe(seeded.reactId);

    const mappingRows = await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.curriculumId, seeded.curriculumId));

    expect(mappingRows).toHaveLength(1);
    expect(mappingRows[0]!.domainNodeId).toBe(seeded.reactId);
    expect(mappingRows.some((row) => row.domainNodeId === "dnode_hallucinated_by_the_agent")).toBe(
      false,
    );
  });
});

describe("triggerCurriculumDomainMapping — non-taxonomy subject rejects cleanly", () => {
  it("returns { error: 'subject_has_no_static_taxonomy' } without ever calling the agent", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedNonTaxonomySubjectWithCurriculum();

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = await triggerCurriculumDomainMapping(seeded.curriculumId);

    expect(result).toEqual({ error: "subject_has_no_static_taxonomy" });
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("the controller surfaces this as HTTP 400", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedNonTaxonomySubjectWithCurriculum();

    const { handleTriggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.controller.js"
    );

    const res = fakeResponse();

    await handleTriggerCurriculumDomainMapping(res, seeded.curriculumId);

    expect(res.statusCode).toBe(400);

    const parsed = JSON.parse(res.body) as { error: string };
    expect(parsed.error).toBe("subject_has_no_static_taxonomy");
  });
});

describe("triggerCurriculumDomainMapping — SCENARIO 11 (agent failure loses no data)", () => {
  it("propagates a rejected agent call as a thrown error, with zero mapping rows inserted", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const seeded = await seedTaxonomySubjectWithCurriculum();

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    await expect(triggerCurriculumDomainMapping(seeded.curriculumId)).rejects.toThrow();

    const { getDb } = await import("../db/client.js");
    const { curriculumDomainNodeMappings } = await import("../db/schema.js");
    const db = getDb();

    const rows = await db
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.curriculumId, seeded.curriculumId));

    expect(rows).toHaveLength(0);
  });

  it("the controller surfaces the failure as HTTP 502 with a non-empty message", async () => {
    mockAgentGenerate.mockClear();
    mockAgentGenerate.mockRejectedValue(new Error("ECONNREFUSED"));

    const seeded = await seedTaxonomySubjectWithCurriculum();

    const { handleTriggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.controller.js"
    );

    const res = fakeResponse();

    await handleTriggerCurriculumDomainMapping(res, seeded.curriculumId);

    expect(res.statusCode).toBe(502);

    const parsed = JSON.parse(res.body) as { error: string; message?: string };
    expect(parsed.error).toBeTruthy();
    expect(parsed.message).toBeTruthy();
  });
});

describe("PATCH /curriculum-domain-mappings/:id — SCENARIO 4/12", () => {
  it("accepting with a depth override writes the overridden depth, not the AI's original suggestion", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedTaxonomySubjectWithCurriculum();

    mockAgentGenerate.mockResolvedValue({
      object: { matches: [{ nodeId: seeded.reactId, depth: "awareness" }], unmatchedTopics: [] },
    });

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = (await triggerCurriculumDomainMapping(seeded.curriculumId)) as Array<{
      id: string;
    }>;
    const mappingId = result[0]!.id;

    const { resolveMapping } = await import("./curriculum-domain-mapping.repo.js");

    const resolved = await resolveMapping(mappingId, { status: "confirmed", depth: "deep" });

    expect("error" in resolved).toBe(false);
    expect((resolved as { depth: string }).depth).toBe("deep");
  });

  it("a second resolution of the same mapping returns already_resolved, never a second write", async () => {
    mockAgentGenerate.mockClear();
    const seeded = await seedTaxonomySubjectWithCurriculum();

    mockAgentGenerate.mockResolvedValue({
      object: { matches: [{ nodeId: seeded.reactId, depth: "working" }], unmatchedTopics: [] },
    });

    const { triggerCurriculumDomainMapping } = await import(
      "./curriculum-domain-mapping.orchestrator.js"
    );

    const result = (await triggerCurriculumDomainMapping(seeded.curriculumId)) as Array<{
      id: string;
    }>;
    const mappingId = result[0]!.id;

    const { resolveMapping } = await import("./curriculum-domain-mapping.repo.js");

    const first = await resolveMapping(mappingId, { status: "confirmed" });
    expect("error" in first).toBe(false);

    const second = await resolveMapping(mappingId, { status: "rejected" });
    expect(second).toEqual({ error: "already_resolved" });
  });
});
