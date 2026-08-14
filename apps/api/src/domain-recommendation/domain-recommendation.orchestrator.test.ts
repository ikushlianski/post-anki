import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// deepen-widen-recommendations (issue #90) — scenarios.md ACs 13-16, 18-25
// (AC 17, the real-it-taxonomy.yaml proof, lives in its own
// domain-recommendation-real-taxonomy.integration.test.ts). Touches a real,
// freshly-migrated throwaway Postgres — same rationale as
// domain-priority-review.orchestrator.test.ts: AC 22/23 require reading a
// real curriculum_domain_node_mappings row after accept, which a
// mocked-repo shape can't produce. Named exception in
// apps/api/vitest.config.ts's exclude list.
//
// createCurriculum is a PASS-THROUGH spy (real implementation, wrapped so
// call args/count are assertable and a single call can be overridden with
// mockImplementationOnce for the subject_not_found recovery test) rather
// than a full mock — AC 21 needs the real args assertion, AC 22/23 need the
// real side effect, AC 24 needs one forced failure. researchCurriculum is
// fully mocked (a no-op) since it dispatches a real agent call this test
// must never actually make.

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

vi.mock("../curriculum/curriculum.repo.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../curriculum/curriculum.repo.js")>();

  return { ...actual, createCurriculum: vi.fn(actual.createCurriculum) };
});

vi.mock("../curriculum/curriculum-parse.orchestrator.js", () => ({
  researchCurriculum: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const dbName = `domainrec_orchestrator_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;

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

beforeEach(async () => {
  const { createCurriculum } = await import("../curriculum/curriculum.repo.js");

  vi.mocked(createCurriculum).mockClear();
});

async function mapCurriculumToNode(
  subjectId: string,
  domainNodeId: string,
  maturity: number,
): Promise<string> {
  const { getDb } = await import("../db/client.js");
  const { curricula, curriculumDomainNodeMappings, modules, topics } = await import(
    "../db/schema.js"
  );
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const curriculumId = newId("cur");
  const moduleId = newId("mod");
  const topicId = newId("top");

  await db.insert(curricula).values({ id: curriculumId, subjectId, name: "Mapped curriculum" });
  await db.insert(modules).values({ id: moduleId, curriculumId, title: "Module", order: 0 });
  await db.insert(topics).values({
    id: topicId,
    moduleId,
    curriculumId,
    title: "Topic",
    order: 0,
    included: true,
    progressStatus: maturity >= 100 ? "mastered" : "not_started",
    progressMaturity: maturity,
  });
  await db.insert(curriculumDomainNodeMappings).values({
    id: newId("cdnm"),
    curriculumId,
    domainNodeId,
    status: "confirmed",
    source: "manual",
  });

  return curriculumId;
}

// Networking (root, active via a direct mapping) > TCP/IP (mastered, 100%)
// > DNS (uncovered child — the deepen candidate). Cloud Computing (root,
// zero coverage) — the widen candidate, sourced from Networking.
async function seedRecommendationSubject(): Promise<{
  subjectId: string;
  networkingId: string;
  tcpIpId: string;
  dnsId: string;
  cloudId: string;
}> {
  const { getDb } = await import("../db/client.js");
  const { subjects, domainNodes } = await import("../db/schema.js");
  const { newId } = await import("../shared/id.js");

  const db = getDb();
  const subjectId = newId("sub");
  const networkingId = newId("dnode");
  const tcpIpId = newId("dnode");
  const dnsId = newId("dnode");
  const cloudId = newId("dnode");

  await db.insert(subjects).values({ id: subjectId, name: `Orchestrator test subject ${subjectId}` });
  await db.insert(domainNodes).values([
    { id: networkingId, subjectId, parentId: null, name: "Networking", order: 0, source: "static_taxonomy" },
    { id: tcpIpId, subjectId, parentId: networkingId, name: "TCP/IP", order: 0, source: "static_taxonomy" },
    { id: dnsId, subjectId, parentId: tcpIpId, name: "DNS", order: 0, source: "static_taxonomy" },
    { id: cloudId, subjectId, parentId: null, name: "Cloud Computing", order: 1, source: "static_taxonomy" },
  ]);

  await mapCurriculumToNode(subjectId, networkingId, 10);
  await mapCurriculumToNode(subjectId, tcpIpId, 100);

  return { subjectId, networkingId, tcpIpId, dnsId, cloudId };
}

describe("triggerDomainRecommendations — gating (AC 13, 14)", () => {
  it("returns no_domain_nodes for a subject with an empty tree", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");

    const subjectId = newId("sub");
    await getDb()
      .insert(subjects)
      .values({ id: subjectId, name: `Empty tree subject ${subjectId}` });

    const { triggerDomainRecommendations } = await import(
      "./domain-recommendation.orchestrator.js"
    );

    expect(await triggerDomainRecommendations(subjectId)).toEqual({ error: "no_domain_nodes" });
  });

  it("returns not_taxonomy_backed when no node carries source static_taxonomy", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes } = await import("../db/schema.js");
    const { newId } = await import("../shared/id.js");

    const subjectId = newId("sub");
    const nodeId = newId("dnode");
    await getDb()
      .insert(subjects)
      .values({ id: subjectId, name: `AI-generated tree subject ${subjectId}` });
    await getDb()
      .insert(domainNodes)
      .values({ id: nodeId, subjectId, parentId: null, name: "Some topic", order: 0, source: "ai_generated" });

    const { triggerDomainRecommendations } = await import(
      "./domain-recommendation.orchestrator.js"
    );

    expect(await triggerDomainRecommendations(subjectId)).toEqual({ error: "not_taxonomy_backed" });
  });
});

describe("triggerDomainRecommendations — insertion and suppression (AC 15, 16)", () => {
  it("inserts exactly one row per candidate, and nothing new on a re-trigger with no resolve in between", async () => {
    const { subjectId, tcpIpId, dnsId, networkingId, cloudId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations } = await import(
      "./domain-recommendation.orchestrator.js"
    );

    const first = await triggerDomainRecommendations(subjectId);

    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    expect(first).toHaveLength(2);

    const deepen = first.find((row) => row.axis === "deepen")!;
    expect(deepen).toMatchObject({ domainNodeId: dnsId, sourceNodeId: tcpIpId, status: "pending" });

    const widen = first.find((row) => row.axis === "widen")!;
    expect(widen).toMatchObject({ domainNodeId: cloudId, sourceNodeId: networkingId, status: "pending" });

    const second = await triggerDomainRecommendations(subjectId);

    if ("error" in second) {
      throw new Error(`unexpected error: ${second.error}`);
    }

    expect(second).toHaveLength(0);
  });

  it("inserts nothing new for a node that already has an accepted row", async () => {
    const { subjectId, dnsId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const deepen = first.find((row) => row.axis === "deepen")!;
    const resolved = await resolveDomainRecommendation(deepen.id, "accepted");
    expect("error" in resolved).toBe(false);

    const third = await triggerDomainRecommendations(subjectId);
    if ("error" in third) {
      throw new Error(`unexpected error: ${third.error}`);
    }

    expect(third.some((row) => row.domainNodeId === dnsId)).toBe(false);
  });
});

describe("resolveDomainRecommendation — not found / already resolved (AC 18, 19)", () => {
  it("returns not_found for an id with no row", async () => {
    const { resolveDomainRecommendation } = await import("./domain-recommendation.orchestrator.js");

    expect(await resolveDomainRecommendation("domainrec_does_not_exist", "accepted")).toEqual({
      error: "not_found",
    });
  });

  it("the second call loses the claim regardless of which decision it carries — the first call's decision wins", async () => {
    const { subjectId, dnsId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );
    const { createCurriculum } = await import("../curriculum/curriculum.repo.js");

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const deepen = first.find((row) => row.domainNodeId === dnsId)!;

    const firstCall = await resolveDomainRecommendation(deepen.id, "accepted");
    const secondCall = await resolveDomainRecommendation(deepen.id, "rejected");

    expect("error" in firstCall).toBe(false);
    expect(secondCall).toEqual({ error: "already_resolved" });
    expect(vi.mocked(createCurriculum)).toHaveBeenCalledTimes(1);

    const { getDb } = await import("../db/client.js");
    const { domainRecommendations } = await import("../db/schema.js");
    const finalRow = (
      await getDb().select().from(domainRecommendations).where(eq(domainRecommendations.id, deepen.id))
    )[0]!;

    expect(finalRow.status).toBe("accepted");
  });
});

describe("resolveDomainRecommendation — reject (AC 20)", () => {
  it("sets status rejected + resolvedAt, and calls createCurriculum zero times", async () => {
    const { subjectId, dnsId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );
    const { createCurriculum } = await import("../curriculum/curriculum.repo.js");

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const deepen = first.find((row) => row.domainNodeId === dnsId)!;
    const resolved = await resolveDomainRecommendation(deepen.id, "rejected");

    if ("error" in resolved) {
      throw new Error(`unexpected error: ${resolved.error}`);
    }

    expect(resolved.status).toBe("rejected");
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.createdCurriculumId).toBeNull();
    expect(vi.mocked(createCurriculum)).not.toHaveBeenCalled();
  });
});

describe("resolveDomainRecommendation — accept (AC 21, 22, 23)", () => {
  it("calls createCurriculum with the exact research-topic intake shape, confirms the mapping, and records createdCurriculumId", async () => {
    const { subjectId, dnsId, tcpIpId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );
    const { createCurriculum } = await import("../curriculum/curriculum.repo.js");

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const deepen = first.find((row) => row.domainNodeId === dnsId)!;
    const resolved = await resolveDomainRecommendation(deepen.id, "accepted");

    if ("error" in resolved) {
      throw new Error(`unexpected error: ${resolved.error}`);
    }

    expect(vi.mocked(createCurriculum)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createCurriculum)).toHaveBeenCalledWith({
      subjectId,
      name: "DNS",
      sources: [],
      researchTopic: "DNS",
      domainNodeId: dnsId,
      domainNodeSource: "manual",
    });

    expect(resolved.createdCurriculumId).not.toBeNull();

    const { getDb } = await import("../db/client.js");
    const { curriculumDomainNodeMappings, domainRecommendations } = await import(
      "../db/schema.js"
    );

    const mappingRows = await getDb()
      .select()
      .from(curriculumDomainNodeMappings)
      .where(eq(curriculumDomainNodeMappings.curriculumId, resolved.createdCurriculumId!));

    expect(mappingRows).toEqual([
      expect.objectContaining({ domainNodeId: dnsId, status: "confirmed" }),
    ]);

    const persisted = (
      await getDb()
        .select()
        .from(domainRecommendations)
        .where(eq(domainRecommendations.id, deepen.id))
    )[0]!;

    expect(persisted.createdCurriculumId).toBe(resolved.createdCurriculumId);
    // tcpIpId is only used to keep the seeded-parent reference alive for
    // readability in this test's intent; not asserted directly here.
    expect(tcpIpId).toBeTruthy();
  });
});

describe("resolveDomainRecommendation — subject deleted after claim (AC 24)", () => {
  it("releases the claim back to pending, with no createdCurriculumId, when createCurriculum reports subject_not_found", async () => {
    const { subjectId, dnsId } = await seedRecommendationSubject();
    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );
    const { createCurriculum } = await import("../curriculum/curriculum.repo.js");

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const deepen = first.find((row) => row.domainNodeId === dnsId)!;

    vi.mocked(createCurriculum).mockImplementationOnce(async () => ({
      error: "subject_not_found" as const,
    }));

    const resolved = await resolveDomainRecommendation(deepen.id, "accepted");

    expect(resolved).toEqual({ error: "subject_not_found" });

    const { getDb } = await import("../db/client.js");
    const { domainRecommendations } = await import("../db/schema.js");
    const row = (
      await getDb().select().from(domainRecommendations).where(eq(domainRecommendations.id, deepen.id))
    )[0]!;

    expect(row.status).toBe("pending");
    expect(row.resolvedAt).toBeNull();
    expect(row.createdCurriculumId).toBeNull();
  });
});

describe("reject never resurfaces the same node, even across a changed active source (AC 25)", () => {
  it("inserts no new row for a rejected widen target after a different root becomes the active one", async () => {
    const { getDb } = await import("../db/client.js");
    const { subjects, domainNodes, curriculumDomainNodeMappings } = await import(
      "../db/schema.js"
    );
    const { newId } = await import("../shared/id.js");
    const db = getDb();

    const subjectId = newId("sub");
    const rootAId = newId("dnode");
    const rootBId = newId("dnode");
    const rootCId = newId("dnode");

    await db.insert(subjects).values({ id: subjectId, name: `Cross-axis subject ${subjectId}` });
    await db.insert(domainNodes).values([
      { id: rootAId, subjectId, parentId: null, name: "Root A", order: 0, source: "static_taxonomy" },
      { id: rootBId, subjectId, parentId: null, name: "Root B (widen target)", order: 1, source: "static_taxonomy" },
      { id: rootCId, subjectId, parentId: null, name: "Root C", order: 2, source: "static_taxonomy" },
    ]);

    const curriculumAId = await mapCurriculumToNode(subjectId, rootAId, 10);

    const { triggerDomainRecommendations, resolveDomainRecommendation } = await import(
      "./domain-recommendation.orchestrator.js"
    );

    const first = await triggerDomainRecommendations(subjectId);
    if ("error" in first) {
      throw new Error(`unexpected error: ${first.error}`);
    }

    const widenForB = first.find((row) => row.domainNodeId === rootBId)!;
    expect(widenForB.sourceNodeId).toBe(rootAId);

    const rejected = await resolveDomainRecommendation(widenForB.id, "rejected");
    if ("error" in rejected) {
      throw new Error(`unexpected error: ${rejected.error}`);
    }
    expect(rejected.status).toBe("rejected");

    // Root A stops being active; Root C becomes active instead — under the
    // unchanged rule, Root B (still 0%, still uncovered) is newly eligible
    // again, just sourced from a different root this time.
    await db
      .update(curriculumDomainNodeMappings)
      .set({ status: "rejected" })
      .where(eq(curriculumDomainNodeMappings.curriculumId, curriculumAId));
    await mapCurriculumToNode(subjectId, rootCId, 10);

    const second = await triggerDomainRecommendations(subjectId);
    if ("error" in second) {
      throw new Error(`unexpected error: ${second.error}`);
    }

    expect(second.some((row) => row.domainNodeId === rootBId)).toBe(false);

    const { domainRecommendations } = await import("../db/schema.js");
    const rowsForB = await db
      .select()
      .from(domainRecommendations)
      .where(eq(domainRecommendations.domainNodeId, rootBId));

    expect(rowsForB).toHaveLength(1);
    expect(rowsForB[0]!.status).toBe("rejected");
  });
});
