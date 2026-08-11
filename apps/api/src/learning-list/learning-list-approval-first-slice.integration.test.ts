import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LearningListRecommendation } from "@post-anki/shared";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const mockDomainMappingGenerate = vi.fn();
const mockSliceGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { domainTaxonomyMapping: "domainTaxonomyMapping", learningListSlice: "learningListSlice" },
  getMastra: () => ({
    getAgent: (key: string) => ({
      generate: key === "learningListSlice" ? mockSliceGenerate : mockDomainMappingGenerate,
    }),
  }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

const dbName = `ll_approval_first_slice_${randomUUID().replace(/-/g, "_")}`;
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

const { approveRecommendation } = await import("./learning-list-approval.orchestrator.js");
const { insertLearningListItem, saveClassification, getLearningListItem } = await import(
  "./learning-list.repo.js"
);

let client: pg.Client;
let subjectId: string;
let awsNodeId: string;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  subjectId = `sub_${randomUUID()}`;
  awsNodeId = `dnode_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, 'First Slice Subject', false, 'architecture-mentor')`,
    [subjectId],
  );
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
     VALUES ($1, $2, NULL, 'AWS', 0, 'static_taxonomy', 'sub_subject')`,
    [awsNodeId, subjectId],
  );
}, 30_000);

afterEach(() => {
  mockDomainMappingGenerate.mockReset();
  mockSliceGenerate.mockReset();
});

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

function recommendation(
  overrides: Partial<LearningListRecommendation> = {},
): LearningListRecommendation {
  return {
    verdict: "series",
    reasons: ['the page is labelled part 1 of 9'],
    destination: "mini_course",
    areaId: null,
    areaName: null,
    subSubjectNodeId: awsNodeId,
    subjectId,
    concern: null,
    partCount: 9,
    existingCurriculumMatch: null,
    ...overrides,
  };
}

/* `kind: "video"` with real `rawText` (never a URL) so `sourcesForItem`
   drafts a `kind: "text"` source — `resolveSourceText` resolves that
   synchronously with no network fetch, unlike a `link` source, which would
   try to actually reach the fake `https://...` host these tests would
   otherwise need. */
async function classifiedItem(overrides: Partial<LearningListRecommendation> = {}): Promise<string> {
  const item = await insertLearningListItem({
    url: null,
    rawText: "A grounding guide about securing AWS identity and access, part one of a series.",
    title: "Security for agentic AI on AWS",
    kind: "video",
  });

  await saveClassification(item.id, {
    title: "Security for agentic AI on AWS",
    rawText: "guide text",
    verdict: "series",
    recommendation: recommendation(overrides),
    questionCeiling: 27,
    status: "classified",
  });

  return item.id;
}

describe("0.10 — approving a mini-course triggers its first slice release", () => {
  it("produces real topics and gaps on approval, with no answer ever recorded", async () => {
    mockDomainMappingGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [
          { title: "IAM roles vs. users", summary: "Grounding on AWS IAM", gaps: [{ label: "What is an IAM role?", depth: "working" }] },
        ],
      },
    });

    const itemId = await classifiedItem();
    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;

    const topics = await client.query(
      `SELECT id FROM topics WHERE curriculum_id = $1 AND included = true`,
      [curriculumId],
    );

    expect(topics.rowCount).toBe(1);

    const gaps = await client.query(
      `SELECT g.id FROM gaps g JOIN topics t ON t.id = g.topic_id WHERE t.curriculum_id = $1`,
      [curriculumId],
    );

    expect(gaps.rowCount).toBe(1);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.questionsGenerated).toBe(1);
  });

  it("never creates a domain_nodes row through this trigger path either", async () => {
    mockDomainMappingGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [{ title: "S3 bucket policies", summary: null, gaps: [{ label: "g1", depth: "working" }] }],
      },
    });

    const before = await client.query(`SELECT count(*)::int AS count FROM domain_nodes`);

    const itemId = await classifiedItem();

    await approveRecommendation(itemId);

    const after = await client.query(`SELECT count(*)::int AS count FROM domain_nodes`);

    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("still succeeds when the slice-generation agent fails, leaving the approval itself intact", async () => {
    mockDomainMappingGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockSliceGenerate.mockRejectedValue(new Error("model unreachable"));

    const itemId = await classifiedItem();
    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("course_created");
    expect(reloaded!.questionsGenerated).toBe(0);
  });
});

describe("0.10 — extending an existing curriculum also releases a first slice for the newly linked item", () => {
  async function targetCurriculumWithSource(status: string): Promise<string> {
    const curriculumId = `cur_${randomUUID()}`;

    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'React Hooks deep dive', $3)`,
      [curriculumId, subjectId, status],
    );
    await client.query(
      `INSERT INTO sources (id, curriculum_id, kind, value, title, fetched_text)
       VALUES ($1, $2, 'text', 'https://example.com/a', 'A guide', 'Real grounding text about React Hooks.')`,
      [`src_${randomUUID()}`, curriculumId],
    );

    return curriculumId;
  }

  it("releases real content for the extending item off the target curriculum's existing sources", async () => {
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [{ title: "useEffect cleanup", summary: null, gaps: [{ label: "g1", depth: "working" }] }],
      },
    });

    const targetCurriculumId = await targetCurriculumWithSource("ready");

    const itemId = await classifiedItem({
      destination: "extend_curriculum",
      existingCurriculumMatch: { curriculumId: targetCurriculumId, title: "React Hooks deep dive" },
    });

    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.questionsGenerated).toBe(1);

    const topics = await client.query(
      `SELECT id FROM topics WHERE curriculum_id = $1 AND included = true`,
      [targetCurriculumId],
    );

    expect(topics.rowCount).toBe(1);
  });
});
