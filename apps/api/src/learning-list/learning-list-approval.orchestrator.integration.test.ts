import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { LearningListRecommendation } from "@post-anki/shared";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const mockAgentGenerate = vi.fn();
const mockDiscoverGithubChapters = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { domainTaxonomyMapping: "domainTaxonomyMapping" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

// No test in this file cares about GitHub book discovery unless it says so —
// defaulting to "no other chapters found" keeps every other approval test
// exercising exactly the pre-existing, non-book-shaped path.
mockDiscoverGithubChapters.mockResolvedValue({ chapters: [], truncated: false, capped: false });

vi.mock("./github-chapters.js", () => ({
  discoverGithubChapters: (...args: unknown[]) => mockDiscoverGithubChapters(...args),
}));

/* 0.10 stubs the first-slice-release trigger out of this file entirely: this
   suite's `mockAgentGenerate` is a single, unqueued mock dedicated to the
   domain-mapping assertions below. `approveRecommendation` now also fires
   `releaseNextSliceSafely` (see `learning-list-approval.orchestrator.ts`),
   which would otherwise call `getMastra().getAgent(AGENT_KEYS.learningListSlice)`
   through this same mock — stealing the domain-mapping response shape and,
   on a fake `https://...` URL with no `fetchedText` cached, forcing a real
   network fetch attempt in `assembleAllSourceText`. Real end-to-end coverage
   of the trigger itself lives in
   `learning-list-approval-first-slice.integration.test.ts`, which mocks
   `../mastra/mastra.js` with a key-routed agent instead. */
vi.mock("./slice-release.js", () => ({
  releaseNextSliceSafely: vi.fn().mockResolvedValue(null),
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

const dbName = `ll_approval_${randomUUID().replace(/-/g, "_")}`;
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

const { approveRecommendation, declineRecommendation, respondToLearningListNudge } = await import(
  "./learning-list-approval.orchestrator.js"
);
const { insertLearningListItem, saveClassification, getLearningListItem } = await import(
  "./learning-list.repo.js"
);
const { listCurricula } = await import("../curriculum/curriculum.repo.js");

let client: pg.Client;
let subjectId: string;
let awsNodeId: string;

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  subjectId = `sub_${randomUUID()}`;
  awsNodeId = `dnode_${randomUUID()}`;

  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, 'Approval Subject', false, 'architecture-mentor')`,
    [subjectId],
  );
  await client.query(
    `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
     VALUES ($1, $2, NULL, 'AWS', 0, 'static_taxonomy', 'sub_subject')`,
    [awsNodeId, subjectId],
  );
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
    concern: "security",
    partCount: 9,
    existingCurriculumMatch: null,
    ...overrides,
  };
}

async function classifiedItem(overrides: Partial<LearningListRecommendation> = {}) {
  const item = await insertLearningListItem({
    url: `https://aws.example.com/${randomUUID()}`,
    rawText: null,
    title: null,
    kind: "article",
  });

  const rec = recommendation(overrides);
  const awaitingDecision =
    rec.destination === "mini_course" ||
    rec.destination === "extend_curriculum" ||
    rec.destination === "fold_in";

  await saveClassification(item.id, {
    title: "Security for agentic AI on AWS",
    rawText: "guide text",
    verdict: rec.verdict,
    recommendation: rec,
    questionCeiling: 27,
    status: awaitingDecision ? "classified" : "parked",
  });

  return item.id;
}

describe("approveRecommendation — SCENARIO 2 and 3", () => {
  it("creates exactly one curriculum, carrying the cross-cutting concern", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const itemId = await classifiedItem();
    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const curricula = await client.query(
      `SELECT id, name, concern FROM curricula WHERE subject_id = $1 AND id = $2`,
      [subjectId, (result as { curriculumId: string }).curriculumId],
    );

    expect(curricula.rowCount).toBe(1);
    expect(curricula.rows[0].concern).toBe("security");
    expect(curricula.rows[0].name).toBe("Security for agentic AI on AWS");

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("course_created");
    expect(reloaded!.curriculumId).toBe((result as { curriculumId: string }).curriculumId);
  });

  it("starts liveness tracking on approval, at the starting score", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const itemId = await classifiedItem();

    await approveRecommendation(itemId);

    const rows = await client.query(
      `SELECT score, last_activity_at FROM liveness WHERE entity_type = 'learning_list_item' AND entity_id = $1`,
      [itemId],
    );

    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].score).toBe(7);
  });

  it("leaves AI-proposed taxonomy mappings as suggestions, never auto-confirmed", async () => {
    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Identity & Access', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    mockAgentGenerate.mockResolvedValue({
      object: {
        matches: [
          { nodeId: areaNodeId, depth: "working" },
          { nodeId: "dnode_hallucinated_by_the_model", depth: "deep" },
        ],
        unmatchedTopics: [],
      },
    });

    const itemId = await classifiedItem();
    const result = await approveRecommendation(itemId);
    const curriculumId = (result as { curriculumId: string }).curriculumId;

    const suggested = await client.query(
      `SELECT domain_node_id FROM curriculum_domain_node_mappings WHERE curriculum_id = $1 AND status = 'suggested' ORDER BY domain_node_id`,
      [curriculumId],
    );

    expect(suggested.rows.map((row) => row.domain_node_id).sort()).toEqual(
      [areaNodeId, awsNodeId].sort(),
    );

    const confirmed = await client.query(
      `SELECT id FROM curriculum_domain_node_mappings WHERE curriculum_id = $1 AND status = 'confirmed'`,
      [curriculumId],
    );

    expect(confirmed.rowCount).toBe(0);
  });

  it("refuses to approve an item that was parked rather than settled on a destination", async () => {
    const itemId = await classifiedItem({ verdict: "unknown", destination: "park" });

    expect(await approveRecommendation(itemId)).toEqual({ error: "not_awaiting_decision" });
  });

  it("reports a missing item as not found", async () => {
    expect(await approveRecommendation(`llitem_${randomUUID()}`)).toEqual({ error: "not_found" });
  });
});

describe("approveRecommendation — series with known parts shapes the course like the book", () => {
  it("creates one module per discovered chapter, in book order, each carrying its own source", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const chapters = Array.from({ length: 12 }, (_, i) => ({
      path: `0${Math.floor(i / 4) + 1}-Part/Chapter_${i + 1}.md`,
      title: `Chapter ${i + 1} — Topic ${i + 1}`,
      url: `https://github.com/owner/repo/blob/main/0${Math.floor(i / 4) + 1}-Part/Chapter_${i + 1}.md`,
    }));

    mockDiscoverGithubChapters.mockResolvedValueOnce({ chapters, truncated: false, capped: false });

    const capturedChapter = chapters[4]!;
    const item = await insertLearningListItem({
      url: capturedChapter.url,
      rawText: null,
      title: null,
      kind: "article",
    });

    await saveClassification(item.id, {
      title: "A different title the classifier picked",
      rawText: "chapter text",
      verdict: "series",
      recommendation: recommendation({ partCount: 12 }),
      questionCeiling: 30,
      status: "classified",
    });

    const result = await approveRecommendation(item.id);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;

    const modules = await client.query(
      `SELECT title, "order" FROM modules WHERE curriculum_id = $1 ORDER BY "order"`,
      [curriculumId],
    );

    expect(modules.rowCount).toBe(12);
    expect(modules.rows.map((row) => row.title)).toEqual(chapters.map((c) => c.title));
    expect(modules.rows.map((row) => row.order)).toEqual(chapters.map((_, i) => i + 1));

    const sources = await client.query(`SELECT value, title FROM sources WHERE curriculum_id = $1`, [
      curriculumId,
    ]);

    expect(sources.rowCount).toBe(12);

    const capturedSource = sources.rows.find((row) => row.value === capturedChapter.url);

    // The captured item's own source row (created by createCurriculum from
    // sourcesForItem) is re-titled to its derived chapter title, not
    // duplicated into a second row.
    expect(capturedSource?.title).toBe(capturedChapter.title);
  });

  it("seeds no modules up front when the discoverer finds no other parts — legacy behaviour", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockDiscoverGithubChapters.mockResolvedValueOnce({ chapters: [], truncated: false, capped: false });

    const itemId = await classifiedItem();
    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;
    const modules = await client.query(`SELECT id FROM modules WHERE curriculum_id = $1`, [curriculumId]);

    expect(modules.rowCount).toBe(0);
  });

  it("shapes a course from persisted sibling URLs when no code-host discoverer applies — the AWS guide series", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockDiscoverGithubChapters.mockResolvedValueOnce({ chapters: [], truncated: false, capped: false });

    const capturedUrl =
      "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/introduction.html";
    const siblingUrls = [
      "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/threat-modeling.html",
      "https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-security/data-protection.html",
    ];

    const item = await insertLearningListItem({
      url: capturedUrl,
      rawText: null,
      title: null,
      kind: "article",
    });

    await saveClassification(item.id, {
      title: null,
      rawText: "guide text",
      verdict: "series",
      recommendation: recommendation({ partCount: 9, siblingUrls }),
      questionCeiling: 54,
      status: "classified",
    });

    const result = await approveRecommendation(item.id);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;
    const modules = await client.query(
      `SELECT title, "order" FROM modules WHERE curriculum_id = $1 ORDER BY "order"`,
      [curriculumId],
    );

    // The captured item has no classified title, so its own module title is
    // derived from its URL path exactly like its siblings.
    expect(modules.rowCount).toBe(3);
    expect(modules.rows.map((row) => row.title)).toEqual([
      "Agentic Ai Security",
      "Threat Modeling",
      "Data Protection",
    ]);

    const sources = await client.query(`SELECT value, title FROM sources WHERE curriculum_id = $1`, [
      curriculumId,
    ]);
    const capturedSource = sources.rows.find((row) => row.value === capturedUrl);

    expect(capturedSource?.title).toBe("Agentic Ai Security");
  });

  it("raises a question ceiling that was planned before the parts were known", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockDiscoverGithubChapters.mockResolvedValueOnce({ chapters: [], truncated: false, capped: false });

    const capturedUrl = "https://example.com/guide/introduction.html";
    const siblingUrls = [
      "https://example.com/guide/one.html",
      "https://example.com/guide/two.html",
      "https://example.com/guide/three.html",
      "https://example.com/guide/four.html",
      "https://example.com/guide/five.html",
    ];

    const item = await insertLearningListItem({
      url: capturedUrl,
      rawText: null,
      title: null,
      kind: "article",
    });

    await saveClassification(item.id, {
      title: null,
      rawText: "guide text",
      verdict: "series",
      recommendation: recommendation({ partCount: 2, siblingUrls }),
      questionCeiling: 20,
      status: "classified",
    });

    const result = await approveRecommendation(item.id);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;
    const modules = await client.query(`SELECT id FROM modules WHERE curriculum_id = $1`, [
      curriculumId,
    ]);

    expect(modules.rowCount).toBe(6);

    const stored = await client.query(
      `SELECT question_ceiling FROM learning_list_items WHERE id = $1`,
      [item.id],
    );

    expect(Number(stored.rows[0].question_ceiling)).toBe(36);
  });

  it("never lowers a question ceiling that already exceeds the seeded part count", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });
    mockDiscoverGithubChapters.mockResolvedValueOnce({ chapters: [], truncated: false, capped: false });

    const capturedUrl = "https://example.com/other/introduction.html";
    const siblingUrls = ["https://example.com/other/one.html"];

    const item = await insertLearningListItem({
      url: capturedUrl,
      rawText: null,
      title: null,
      kind: "article",
    });

    await saveClassification(item.id, {
      title: null,
      rawText: "guide text",
      verdict: "series",
      recommendation: recommendation({ partCount: 9, siblingUrls }),
      questionCeiling: 54,
      status: "classified",
    });

    await approveRecommendation(item.id);

    const stored = await client.query(
      `SELECT question_ceiling FROM learning_list_items WHERE id = $1`,
      [item.id],
    );

    expect(Number(stored.rows[0].question_ceiling)).toBe(54);
  });

  it("prefers discovered code-host chapters over persisted sibling URLs when both are available", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const capturedUrl = "https://github.com/owner/repo/blob/main/01-Intro.md";

    mockDiscoverGithubChapters.mockResolvedValueOnce({
      chapters: [
        { path: "01-Intro.md", title: "Chapter 1 — Intro", url: capturedUrl },
        {
          path: "02-Routing.md",
          title: "Chapter 2 — Routing",
          url: "https://github.com/owner/repo/blob/main/02-Routing.md",
        },
      ],
      truncated: false,
      capped: false,
    });

    const item = await insertLearningListItem({
      url: capturedUrl,
      rawText: null,
      title: null,
      kind: "article",
    });

    await saveClassification(item.id, {
      title: "A book",
      rawText: "chapter text",
      verdict: "series",
      recommendation: recommendation({
        partCount: 2,
        siblingUrls: ["https://not-the-repo.example.com/scraped-guide"],
      }),
      questionCeiling: 20,
      status: "classified",
    });

    const result = await approveRecommendation(item.id);

    expect("error" in result).toBe(false);

    const curriculumId = (result as { curriculumId: string }).curriculumId;
    const modules = await client.query(
      `SELECT title, "order" FROM modules WHERE curriculum_id = $1 ORDER BY "order"`,
      [curriculumId],
    );

    expect(modules.rowCount).toBe(2);
    expect(modules.rows.map((row) => row.title)).toEqual(["Chapter 1 — Intro", "Chapter 2 — Routing"]);

    const sources = await client.query(`SELECT value FROM sources WHERE curriculum_id = $1`, [
      curriculumId,
    ]);

    expect(sources.rows.map((row) => row.value)).not.toContain(
      "https://not-the-repo.example.com/scraped-guide",
    );
  });
});

describe("approveRecommendation — extend an existing curriculum, SCENARIO 0.1", () => {
  it("merges into the matched curriculum instead of creating a second one", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { modules: [] } });

    const targetCurriculumId = `cur_${randomUUID()}`;

    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'React Hooks deep dive', 'ready')`,
      [targetCurriculumId, subjectId],
    );

    const itemId = await classifiedItem({
      destination: "extend_curriculum",
      existingCurriculumMatch: { curriculumId: targetCurriculumId, title: "React Hooks deep dive" },
    });

    const before = await client.query(`SELECT id FROM curricula WHERE subject_id = $1`, [subjectId]);
    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);
    expect((result as { curriculumId: string }).curriculumId).toBe(targetCurriculumId);

    const after = await client.query(`SELECT id FROM curricula WHERE subject_id = $1`, [subjectId]);

    expect(after.rowCount).toBe(before.rowCount);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.curriculumId).toBe(targetCurriculumId);
    expect(reloaded!.status).toBe("course_created");

    const liveness = await client.query(
      `SELECT score FROM liveness WHERE entity_type = 'learning_list_item' AND entity_id = $1`,
      [itemId],
    );

    expect(liveness.rowCount).toBe(1);

    await vi.waitFor(async () => {
      const sources = await client.query(`SELECT id FROM sources WHERE curriculum_id = $1`, [
        targetCurriculumId,
      ]);

      expect(sources.rowCount).toBeGreaterThan(0);
    });
  });

  it("blocks extending a curriculum whose structure is mid-shaping, and releases the claim", async () => {
    const targetCurriculumId = `cur_${randomUUID()}`;

    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, 'React Hooks deep dive', 'shaping_structure')`,
      [targetCurriculumId, subjectId],
    );

    const itemId = await classifiedItem({
      destination: "extend_curriculum",
      existingCurriculumMatch: { curriculumId: targetCurriculumId, title: "React Hooks deep dive" },
    });

    expect(await approveRecommendation(itemId)).toEqual({ error: "extend_target_busy" });

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("classified");
    expect(reloaded!.curriculumId).toBeNull();
  });

  it("reports a missing extend target and releases the claim rather than creating a course anyway", async () => {
    const itemId = await classifiedItem({
      destination: "extend_curriculum",
      existingCurriculumMatch: { curriculumId: `cur_${randomUUID()}`, title: "Deleted course" },
    });

    expect(await approveRecommendation(itemId)).toEqual({ error: "extend_target_missing" });

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("classified");
  });
});

describe("approveRecommendation — fold into an Area container", () => {
  it("creates the Area's container on first fold-in and marks the item folded_in", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { modules: [] } });

    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Effects & Synchronization', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const itemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Effects & Synchronization",
    });

    const result = await approveRecommendation(itemId);

    expect("error" in result).toBe(false);

    const containerId = (result as { curriculumId: string }).curriculumId;

    const containers = await client.query(
      `SELECT name, container_area_node_id FROM curricula WHERE id = $1`,
      [containerId],
    );

    expect(containers.rowCount).toBe(1);
    expect(containers.rows[0].name).toBe("Effects & Synchronization");
    expect(containers.rows[0].container_area_node_id).toBe(areaNodeId);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("folded_in");
    expect(reloaded!.curriculumId).toBe(containerId);

    const liveness = await client.query(
      `SELECT score FROM liveness WHERE entity_type = 'learning_list_item' AND entity_id = $1`,
      [itemId],
    );

    expect(liveness.rowCount).toBe(1);

    const confirmed = await client.query(
      `SELECT status FROM curriculum_domain_node_mappings WHERE curriculum_id = $1 AND domain_node_id = $2`,
      [containerId, areaNodeId],
    );

    expect(confirmed.rowCount).toBe(1);
    expect(confirmed.rows[0].status).toBe("confirmed");

    await vi.waitFor(async () => {
      const sources = await client.query(`SELECT id FROM sources WHERE curriculum_id = $1`, [
        containerId,
      ]);

      expect(sources.rowCount).toBeGreaterThan(0);
    });

    const listed = await listCurricula(subjectId);

    expect(listed.some((c) => c.id === containerId)).toBe(false);
  });

  it("reuses the same container for a second article folded into the same Area", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { modules: [] } });

    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Identity & Access', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const firstItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Identity & Access",
    });
    const secondItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Identity & Access",
    });

    const firstResult = await approveRecommendation(firstItemId);
    const secondResult = await approveRecommendation(secondItemId);

    expect(
      (secondResult as { curriculumId: string }).curriculumId,
    ).toBe((firstResult as { curriculumId: string }).curriculumId);

    const containers = await client.query(
      `SELECT id FROM curricula WHERE subject_id = $1 AND container_area_node_id = $2`,
      [subjectId, areaNodeId],
    );

    expect(containers.rowCount).toBe(1);

    const mappings = await client.query(
      `SELECT id FROM curriculum_domain_node_mappings WHERE curriculum_id = $1 AND domain_node_id = $2`,
      [
        (firstResult as { curriculumId: string }).curriculumId,
        areaNodeId,
      ],
    );

    expect(mappings.rowCount).toBe(1);
  });

  it("resolves two concurrent fold-ins into the same Area to a single container", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { modules: [] } });

    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Networking', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const firstItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Networking",
    });
    const secondItemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Networking",
    });

    const [firstResult, secondResult] = await Promise.all([
      approveRecommendation(firstItemId),
      approveRecommendation(secondItemId),
    ]);

    expect("error" in firstResult).toBe(false);
    expect("error" in secondResult).toBe(false);
    expect(
      (secondResult as { curriculumId: string }).curriculumId,
    ).toBe((firstResult as { curriculumId: string }).curriculumId);

    const containers = await client.query(
      `SELECT id FROM curricula WHERE subject_id = $1 AND container_area_node_id = $2`,
      [subjectId, areaNodeId],
    );

    expect(containers.rowCount).toBe(1);

    const mappings = await client.query(
      `SELECT id FROM curriculum_domain_node_mappings WHERE curriculum_id = $1 AND domain_node_id = $2`,
      [
        (firstResult as { curriculumId: string }).curriculumId,
        areaNodeId,
      ],
    );

    expect(mappings.rowCount).toBe(1);
  });

  it("blocks folding into a container whose structure is mid-shaping, and releases the claim", async () => {
    const areaNodeId = `dnode_${randomUUID()}`;

    await client.query(
      `INSERT INTO domain_nodes (id, subject_id, parent_id, name, "order", source, kind)
       VALUES ($1, $2, $3, 'Storage', 0, 'static_taxonomy', 'area')`,
      [areaNodeId, subjectId, awsNodeId],
    );

    const containerId = `cur_${randomUUID()}`;

    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status, container_area_node_id)
       VALUES ($1, $2, 'Storage', 'shaping_structure', $3)`,
      [containerId, subjectId, areaNodeId],
    );

    const itemId = await classifiedItem({
      verdict: "single",
      destination: "fold_in",
      areaId: areaNodeId,
      areaName: "Storage",
    });

    expect(await approveRecommendation(itemId)).toEqual({ error: "extend_target_busy" });

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("classified");
    expect(reloaded!.curriculumId).toBeNull();
  });
});

describe("declineRecommendation — SCENARIO 2", () => {
  it("leaves the item captured with no curriculum and no taxonomy writes", async () => {
    const itemId = await classifiedItem();

    const declined = await declineRecommendation(itemId);

    expect("error" in declined).toBe(false);

    const reloaded = await getLearningListItem(itemId);

    expect(reloaded!.status).toBe("declined");
    expect(reloaded!.curriculumId).toBeNull();

    const mappings = await client.query(
      `SELECT id FROM curriculum_domain_node_mappings WHERE curriculum_id IN (SELECT id FROM curricula WHERE name = 'Security for agentic AI on AWS' AND id = $1)`,
      [reloaded!.curriculumId ?? "none"],
    );

    expect(mappings.rowCount).toBe(0);
  });
});

describe("respondToLearningListNudge — SCENARIOS 9 and 10", () => {
  it("makes a declined item dormant without deleting its curriculum", async () => {
    mockAgentGenerate.mockResolvedValue({ object: { matches: [], unmatchedTopics: [] } });

    const itemId = await classifiedItem();
    const approved = await approveRecommendation(itemId);
    const curriculumId = (approved as { curriculumId: string }).curriculumId;

    const status = await respondToLearningListNudge(itemId, "no");

    expect((status as { dormant: boolean }).dormant).toBe(true);

    const curricula = await client.query(`SELECT id FROM curricula WHERE id = $1`, [curriculumId]);

    expect(curricula.rowCount).toBe(1);
  });

  it("reports an untracked item rather than inventing a liveness row", async () => {
    const itemId = await classifiedItem();

    expect(await respondToLearningListNudge(itemId, "yes")).toEqual({ error: "not_tracked" });
  });
});
