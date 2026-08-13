import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LearningListRecommendation } from "@post-anki/shared";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

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

const dbName = `ll_repo_${randomUUID().replace(/-/g, "_")}`;
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
  insertLearningListItem,
  insertSiblingLearningListItems,
  getLearningListItem,
  listLearningListItems,
  saveClassification,
  claimRecommendation,
  claimForClassification,
  releaseClassificationClaim,
  claimParkedDestination,
  linkCurriculum,
  listAreaPlacementCandidates,
} = await import("./learning-list.repo.js");

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

function recommendation(
  overrides: Partial<LearningListRecommendation> = {},
): LearningListRecommendation {
  return {
    verdict: "series",
    reasons: ['the page states it is part of a series: "Part 1 of 9"'],
    destination: "mini_course",
    areaId: "dnode_aws_identity",
    areaName: "Identity & Access",
    subSubjectNodeId: "dnode_aws",
    subjectId: "sub_1",
    concern: "security",
    partCount: 9,
    existingCurriculumMatch: null,
    ...overrides,
  };
}

async function classifiedItem(): Promise<string> {
  const item = await insertLearningListItem({
    url: `https://example.com/${randomUUID()}`,
    rawText: null,
    title: null,
    kind: "article",
  });

  await saveClassification(item.id, {
    title: "Security for agentic AI on AWS",
    rawText: "guide text",
    verdict: "series",
    recommendation: recommendation(),
    questionCeiling: 27,
    status: "classified",
  });

  return item.id;
}

async function parkedItem(
  overrides: Partial<LearningListRecommendation> = {},
): Promise<string> {
  const item = await insertLearningListItem({
    url: `https://example.com/${randomUUID()}`,
    rawText: null,
    title: null,
    kind: "article",
  });

  await saveClassification(item.id, {
    title: "Introduction — one of nine guides",
    rawText: "guide text",
    verdict: "unknown",
    recommendation: recommendation({ verdict: "unknown", destination: "park", ...overrides }),
    questionCeiling: 1,
    status: "parked",
  });

  return item.id;
}

describe("classification round-trip — SCENARIO 2, the deciding signals survive a reload", () => {
  it("returns the reasons, area and concern that produced the verdict", async () => {
    const itemId = await classifiedItem();
    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.verdict).toBe("series");
    expect(reloaded!.recommendation).toEqual(recommendation());
    expect(reloaded!.questionCeiling).toBe(27);
    expect(reloaded!.curriculumId).toBeNull();
  });

  it("reads a corrupted recommendation payload as absent rather than throwing", async () => {
    const itemId = await classifiedItem();

    await client.query(`UPDATE learning_list_items SET recommendation = $1 WHERE id = $2`, [
      "not json at all",
      itemId,
    ]);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.recommendation).toBeNull();
    expect(reloaded!.verdict).toBe("series");
  });

  it("reads a recommendation persisted before existingCurriculumMatch existed as a real recommendation, not a corrupted one", async () => {
    const itemId = await classifiedItem();

    await client.query(`UPDATE learning_list_items SET recommendation = $1 WHERE id = $2`, [
      JSON.stringify({ ...recommendation(), existingCurriculumMatch: undefined }),
      itemId,
    ]);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.recommendation).not.toBeNull();
    expect(reloaded!.recommendation!.existingCurriculumMatch).toBeNull();
    expect(reloaded!.recommendation!.destination).toBe("mini_course");
  });
});

describe("claimRecommendation — approve and decline race on the same item", () => {
  it("lets exactly one decision win, and reports the loser as no longer awaiting a decision", async () => {
    const itemId = await classifiedItem();

    const [a, b] = await Promise.all([
      claimRecommendation(itemId, "course_created"),
      claimRecommendation(itemId, "declined"),
    ]);

    const outcomes = [a, b];

    expect(outcomes.filter((outcome) => !("error" in outcome))).toHaveLength(1);
    expect(outcomes.filter((outcome) => "error" in outcome)).toHaveLength(1);

    const reloaded = await getLearningListItem(itemId);

    expect(["course_created", "declined"]).toContain(reloaded!.status);
  });

  it("refuses to decide an item that was never classified", async () => {
    const item = await insertLearningListItem({
      url: "https://example.com/never-classified",
      rawText: null,
      title: null,
      kind: "article",
    });

    expect(await claimRecommendation(item.id, "course_created")).toEqual({
      error: "not_awaiting_decision",
    });
  });

  it("reports a missing item as not found", async () => {
    expect(await claimRecommendation(id("llitem"), "declined")).toEqual({ error: "not_found" });
  });
});

describe("sibling capture — SCENARIO 3, the 8 sibling guides", () => {
  it("captures each sibling once, with nothing generated and no classification", async () => {
    const urls = Array.from({ length: 8 }, () => `https://aws.example.com/${randomUUID()}`);

    const first = await insertSiblingLearningListItems(urls);
    const second = await insertSiblingLearningListItems(urls);

    expect(first).toHaveLength(8);
    expect(second).toHaveLength(0);

    for (const sibling of first) {
      expect(sibling.status).toBe("captured");
      expect(sibling.verdict).toBeNull();
      expect(sibling.recommendation).toBeNull();
      expect(sibling.questionsGenerated).toBe(0);
      expect(sibling.questionCeiling).toBeNull();
    }

    const liveness = await client.query(
      `SELECT id FROM liveness WHERE entity_id = ANY($1::text[])`,
      [first.map((sibling) => sibling.id)],
    );

    expect(liveness.rowCount).toBe(0);
  });
});

describe("listLearningListItems", () => {
  it("filters by status and lists newest first", async () => {
    const itemId = await classifiedItem();

    await insertLearningListItem({
      url: `https://example.com/${randomUUID()}`,
      rawText: null,
      title: null,
      kind: "article",
    });

    const classified = await listLearningListItems("classified");

    expect(classified.map((item) => item.id)).toContain(itemId);
    expect(classified.every((item) => item.status === "classified")).toBe(true);
  });
});

describe("linkCurriculum", () => {
  it("attaches the approved curriculum to the item that produced it", async () => {
    const itemId = await classifiedItem();
    const curriculumId = id("cur");

    const linked = await linkCurriculum(itemId, curriculumId);

    expect(linked!.curriculumId).toBe(curriculumId);
  });
});

describe("listAreaPlacementCandidates — SCENARIO 12, Areas are scoped to their sub-subject", () => {
  it("groups each sub-subject with only its own Areas, including its own Other", async () => {
    const subjectId = id("sub");

    await client.query(
      `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, 'architecture-mentor')`,
      [subjectId, `learning list subject ${subjectId}`],
    );

    const reactId = id("dnode");
    const awsId = id("dnode");
    const plainId = id("dnode");

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $4, NULL, 'React', 0, 'static_taxonomy', 'sub_subject'),
              ($2, $4, NULL, 'AWS', 1, 'static_taxonomy', 'sub_subject'),
              ($3, $4, NULL, 'Frontend Development', 2, 'static_taxonomy', NULL)`,
      [reactId, awsId, plainId, subjectId],
    );

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $5, $3, 'Effects & Synchronization', 0, 'static_taxonomy', 'area'),
              ($2, $5, $3, 'Other', 1, 'static_taxonomy', 'area'),
              ($4, $5, $6, 'Other', 0, 'static_taxonomy', 'area')`,
      [id("dnode"), id("dnode"), reactId, id("dnode"), subjectId, awsId],
    );

    const candidates = await listAreaPlacementCandidates(subjectId);
    const react = candidates.find((candidate) => candidate.subSubjectName === "React")!;
    const aws = candidates.find((candidate) => candidate.subSubjectName === "AWS")!;

    expect(candidates).toHaveLength(2);
    expect(react.areas.map((area) => area.name).sort()).toEqual([
      "Effects & Synchronization",
      "Other",
    ]);
    expect(aws.areas).toHaveLength(1);
    expect(react.areas.find((area) => area.name === "Other")!.id).not.toBe(aws.areas[0]!.id);
  });
});

describe("claimForClassification — an already-captured sibling stub going through classification on demand", () => {
  it("lets exactly one concurrent request claim a captured stub", async () => {
    const stub = await insertSiblingLearningListItems([
      `https://aws.example.com/${randomUUID()}`,
    ]);
    const itemId = stub[0]!.id;

    const [a, b] = await Promise.all([
      claimForClassification(itemId),
      claimForClassification(itemId),
    ]);

    const outcomes = [a, b];

    expect(outcomes.filter((outcome) => !("error" in outcome))).toHaveLength(1);
    expect(outcomes.filter((outcome) => "error" in outcome)).toHaveLength(1);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("classifying");
  });

  it("refuses to claim an item that is not a fresh capture", async () => {
    const itemId = await classifiedItem();

    expect(await claimForClassification(itemId)).toEqual({ error: "not_capturable" });
  });

  it("reports a missing item as not found", async () => {
    expect(await claimForClassification(id("llitem"))).toEqual({ error: "not_found" });
  });

  it("releases a claim back to captured so it can be retried", async () => {
    const stub = await insertSiblingLearningListItems([
      `https://aws.example.com/${randomUUID()}`,
    ]);
    const itemId = stub[0]!.id;

    await claimForClassification(itemId);
    await releaseClassificationClaim(itemId);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("captured");
    expect(await claimForClassification(itemId)).not.toHaveProperty("error");
  });
});

describe("insertLearningListItem — reusing a row claimed for reclassification", () => {
  it("returns the claimed row itself instead of inserting a twin for the same URL", async () => {
    const url = `https://aws.example.com/${randomUUID()}`;
    const stub = await insertSiblingLearningListItems([url]);
    const claimed = await claimForClassification(stub[0]!.id);

    const reused = await insertLearningListItem({
      url,
      rawText: null,
      title: null,
      kind: "article",
    });

    expect(reused.id).toBe((claimed as { id: string }).id);

    const all = await listLearningListItems();

    expect(all.filter((item) => item.url === url)).toHaveLength(1);
  });
});

describe("claimParkedDestination — resolving a parked item's ambiguity", () => {
  it("lets exactly one concurrent request choose a destination for a parked item", async () => {
    const itemId = await parkedItem();

    const [a, b] = await Promise.all([
      claimParkedDestination(itemId, "mini_course"),
      claimParkedDestination(itemId, "fold_in"),
    ]);

    const outcomes = [a, b];

    expect(outcomes.filter((outcome) => !("error" in outcome))).toHaveLength(1);
    expect(outcomes.filter((outcome) => "error" in outcome)).toHaveLength(1);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("classified");
    expect(["mini_course", "fold_in"]).toContain(reloaded!.recommendation!.destination);
  });

  it("overwrites the stored destination while keeping the rest of the recommendation intact", async () => {
    const itemId = await parkedItem({
      areaId: "dnode_aws_identity",
      areaName: "Identity & Access",
    });

    const claimed = await claimParkedDestination(itemId, "fold_in");

    expect(claimed).not.toHaveProperty("error");

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.recommendation!.destination).toBe("fold_in");
    expect(reloaded!.recommendation!.areaId).toBe("dnode_aws_identity");
    expect(reloaded!.recommendation!.verdict).toBe("unknown");
  });

  it("refuses to choose a destination for an item that was never parked", async () => {
    const itemId = await classifiedItem();

    expect(await claimParkedDestination(itemId, "mini_course")).toEqual({
      error: "not_parked",
    });
  });

  it("reports a missing item as not found", async () => {
    expect(await claimParkedDestination(id("llitem"), "mini_course")).toEqual({
      error: "not_found",
    });
  });
});
