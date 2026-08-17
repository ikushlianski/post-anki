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

  it("advances the new curriculum to confirmed once real, studyable content lands, so it can be quizzed immediately", async () => {
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

    const curriculum = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      curriculumId,
    ]);

    expect(curriculum.rows[0].status).toBe("confirmed");
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

    const curriculumId = (result as { curriculumId: string }).curriculumId;

    const curriculum = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      curriculumId,
    ]);

    expect(curriculum.rows[0].status).toBe("curating");
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

  // Status "awaiting_source_approval" keeps `resolveSourceMergeAction` on the
  // "queue_for_approval" branch, so this exercise never touches
  // `mergeSourcesIntoCurriculum` — that background merge unconditionally
  // pushes the target through "curating" on its own (curriculum-parse.
  // orchestrator.ts), which would otherwise race this assertion regardless
  // of anything this fix does. Isolating that lets this test prove the one
  // thing in scope: `approveExtendRecommendation` itself never calls
  // `confirmLearningListCurriculum`, even though a real slice was released.
  it("does not auto-confirm the extended curriculum — manual/research courses keep their own human review step", async () => {
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [{ title: "useMemo pitfalls", summary: null, gaps: [{ label: "g1", depth: "working" }] }],
      },
    });

    const targetCurriculumId = await targetCurriculumWithSource("awaiting_source_approval");

    const itemId = await classifiedItem({
      destination: "extend_curriculum",
      existingCurriculumMatch: { curriculumId: targetCurriculumId, title: "React Hooks deep dive" },
    });

    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const topics = await client.query(
      `SELECT id FROM topics WHERE curriculum_id = $1 AND included = true`,
      [targetCurriculumId],
    );

    expect(topics.rowCount).toBe(1);

    const target = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      targetCurriculumId,
    ]);

    expect(target.rows[0].status).toBe("awaiting_source_approval");
  });
});

describe("0.10 — approving a fold-in also releases a first slice into the Area container", () => {
  // The architect mock here returns a REAL module (not `{ modules: [] }`)
  // on purpose: `mergeSourcesIntoCurriculum` now runs to completion, via
  // `saveCurriculumPlan`, before `releaseNextSliceSafely` starts (see
  // learning-list-fold-in.orchestrator.ts's await-ordering comment). That
  // save defaults `included: true` for every topic it writes (no
  // `defaultIncluded: false` option is passed — contrast
  // `confirmStructure`'s manual-review path in curriculum-structure.ts,
  // which does pass it, to pre-draft topics for the drip-feed release
  // branch in `decideSlice`). So this merge-created topic is never a
  // candidate for `nextUnreleasedTopicIds` (which only selects
  // `included = false`), and `decideSlice` still falls through to
  // `needs_generation` — proven below by the merge's own topic carrying
  // zero gaps while the release's topic carries real ones.
  it("advances the Area container curriculum to confirmed once real, studyable content lands, without silently skipping question generation", async () => {
    mockDomainMappingGenerate.mockResolvedValue({
      object: {
        modules: [
          {
            title: "Storage fundamentals",
            topics: [{ title: "Object storage classes", summary: null, suggestedDepth: "working" }],
            tags: null,
          },
        ],
      },
    });
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [{ title: "S3 bucket policies", summary: null, gaps: [{ label: "g1", depth: "working" }] }],
      },
    });

    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Storage', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const itemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Storage",
    });

    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const containerId = (result as { curriculumId: string }).curriculumId;

    const container = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      containerId,
    ]);

    expect(container.rows[0].status).toBe("confirmed");

    const topics = await client.query(
      `SELECT title, included FROM topics WHERE curriculum_id = $1 ORDER BY title`,
      [containerId],
    );

    expect(topics.rows.map((r) => r.title).sort()).toEqual([
      "Object storage classes",
      "S3 bucket policies",
    ]);
    expect(topics.rows.every((r) => r.included)).toBe(true);

    const gaps = await client.query(
      `SELECT t.title FROM gaps g JOIN topics t ON t.id = g.topic_id WHERE t.curriculum_id = $1`,
      [containerId],
    );

    expect(gaps.rows.map((r) => r.title)).toEqual(["S3 bucket policies"]);
  });

  it("keeps an already-confirmed container confirmed when a second article folds in", async () => {
    mockDomainMappingGenerate.mockResolvedValue({ object: { modules: [] } });
    mockSliceGenerate.mockResolvedValue({
      object: {
        topics: [{ title: "IAM policy basics", summary: null, gaps: [{ label: "g1", depth: "working" }] }],
      },
    });

    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Access Control', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const firstItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Access Control",
    });

    const firstResult = await approveRecommendation(firstItemId);
    const containerId = (firstResult as { curriculumId: string }).curriculumId;

    const afterFirst = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      containerId,
    ]);

    expect(afterFirst.rows[0].status).toBe("confirmed");

    const secondItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Access Control",
    });

    await approveRecommendation(secondItemId);

    const afterSecond = await client.query(`SELECT status FROM curricula WHERE id = $1`, [
      containerId,
    ]);

    expect(afterSecond.rows[0].status).toBe("confirmed");
  });
});
