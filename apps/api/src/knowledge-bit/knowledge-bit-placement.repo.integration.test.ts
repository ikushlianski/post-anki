import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const dbName = `knowledge_bit_placement_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const {
  listKnowledgeBitsForPlacementScan,
  listTopicsForPlacement,
  markKnowledgeBitMatched,
  markKnowledgeBitSuggested,
  markKnowledgeBitPlacementFailed,
  listPendingPlacementSuggestions,
  resolvePlacementSuggestion,
  TOPIC_HIERARCHY_PROMPT_LIMIT,
} = await import("./knowledge-bit-placement.repo.js");

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

async function seedKnowledgeSource(): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', 'Some prose.', 'pending')`,
    [id],
  );

  return id;
}

async function seedKnowledgeBit(
  knowledgeSourceId: string,
  ordinal: number,
  body: string,
  topicId: string | null = null,
  placementSuggestion: string | null = null,
  placementCheckedAt: Date | null = null,
  placementFailedAt: Date | null = null,
  placementSuggestionResolvedAt: Date | null = null,
): Promise<string> {
  const id = `kb_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_bits
       (id, knowledge_source_id, ordinal, body, topic_id, placement_suggestion, placement_checked_at, placement_failed_at, placement_suggestion_resolved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      knowledgeSourceId,
      ordinal,
      body,
      topicId,
      placementSuggestion,
      placementCheckedAt,
      placementFailedAt,
      placementSuggestionResolvedAt,
    ],
  );

  return id;
}

async function seedSubject(name: string): Promise<string> {
  const id = `subj_${randomUUID()}`;

  await client.query(`INSERT INTO subjects (id, name) VALUES ($1, $2)`, [id, name]);

  return id;
}

async function seedCurriculum(
  subjectId: string,
  name: string,
  containerAreaNodeId: string | null = null,
): Promise<string> {
  const id = `curr_${randomUUID()}`;

  await client.query(
    `INSERT INTO curricula (id, subject_id, name, container_area_node_id) VALUES ($1, $2, $3, $4)`,
    [id, subjectId, name, containerAreaNodeId],
  );

  return id;
}

async function seedTopic(
  curriculumId: string,
  title: string,
  included: boolean,
): Promise<string> {
  const id = `topic_${randomUUID()}`;
  const moduleId = `mod_${randomUUID()}`;

  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, moduleId, curriculumId, title, 0, included],
  );

  return id;
}

async function seedModule(curriculumId: string, title: string): Promise<string> {
  const id = `mod_${randomUUID()}`;

  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`,
    [id, curriculumId, title, 0],
  );

  return id;
}

describe("listKnowledgeBitsForPlacementScan (real Postgres)", () => {
  it("returns exactly the bits with placementCheckedAt IS NULL AND placementFailedAt IS NULL", async () => {
    const sourceId = await seedKnowledgeSource();
    const untouchedId = await seedKnowledgeBit(sourceId, 0, "An unplaced bit");

    await seedKnowledgeBit(
      sourceId,
      1,
      "An already-checked bit",
      null,
      null,
      new Date(),
      null,
    );
    await seedKnowledgeBit(sourceId, 2, "A permanently-failed bit", null, null, null, new Date());

    const rows = await listKnowledgeBitsForPlacementScan(100);

    expect(rows).toEqual([{ id: untouchedId, body: "An unplaced bit" }]);
  });
});

describe("listTopicsForPlacement (real Postgres)", () => {
  it("returns exactly the included, non-container topics", async () => {
    const subjectId = await seedSubject("Placement Subject");
    const containerCurriculumId = await seedCurriculum(
      subjectId,
      "Container Curriculum",
      `area_${randomUUID()}`,
    );
    const ordinaryCurriculumId = await seedCurriculum(subjectId, "Ordinary Curriculum");

    const includedTopicId = await seedTopic(ordinaryCurriculumId, "Included Topic", true);

    await seedTopic(ordinaryCurriculumId, "Excluded Topic", false);
    await seedTopic(containerCurriculumId, "Container Topic", true);

    const rows = await listTopicsForPlacement();

    expect(rows).toEqual([
      {
        topicId: includedTopicId,
        topicTitle: "Included Topic",
        curriculumName: "Ordinary Curriculum",
        subjectName: "Placement Subject",
      },
    ]);
  });

  it(`caps the returned rows at TOPIC_HIERARCHY_PROMPT_LIMIT (${TOPIC_HIERARCHY_PROMPT_LIMIT})`, async () => {
    const subjectId = await seedSubject("Cap Subject");
    const curriculumId = await seedCurriculum(subjectId, "Cap Curriculum");
    const moduleId = `mod_${randomUUID()}`;

    await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4)`, [
      moduleId,
      curriculumId,
      "Cap Module",
      0,
    ]);

    const topicCount = TOPIC_HIERARCHY_PROMPT_LIMIT + 1;
    const values: string[] = [];
    const params: unknown[] = [];

    for (let i = 0; i < topicCount; i++) {
      const base = params.length;

      values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
      params.push(`topic_${randomUUID()}`, moduleId, curriculumId, `Cap Topic ${i}`, i, true);
    }

    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order", included) VALUES ${values.join(", ")}`,
      params,
    );

    const rows = await listTopicsForPlacement();

    expect(rows).toHaveLength(TOPIC_HIERARCHY_PROMPT_LIMIT);
  });
});

describe("markKnowledgeBitMatched (real Postgres)", () => {
  it("persists topicId and placementCheckedAt on read-back after marking a bit matched", async () => {
    const subjectId = await seedSubject("Match Subject");
    const curriculumId = await seedCurriculum(subjectId, "Match Curriculum");
    const topicId = await seedTopic(curriculumId, "Match Topic", true);

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to match");

    await markKnowledgeBitMatched(bitId, topicId, "A bit to match");

    const { rows } = await client.query(
      `SELECT topic_id, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.topic_id).toBe(topicId);
    expect(rows[0]!.placement_checked_at).toBeInstanceOf(Date);
  });

  it("should leave topicId and placementCheckedAt null when the body was edited after the scan read it", async () => {
    const subjectId = await seedSubject("Stale Match Subject");
    const curriculumId = await seedCurriculum(subjectId, "Stale Match Curriculum");
    const topicId = await seedTopic(curriculumId, "Stale Match Topic", true);

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      bitId,
    ]);

    await markKnowledgeBitMatched(bitId, topicId, "The original body");

    const { rows } = await client.query(
      `SELECT topic_id, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.topic_id).toBeNull();
    expect(rows[0]!.placement_checked_at).toBeNull();
  });
});

describe("markKnowledgeBitSuggested (real Postgres)", () => {
  it("persists placementSuggestion and placementCheckedAt on read-back after marking a bit suggested", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with no home yet");

    await markKnowledgeBitSuggested(
      bitId,
      "Create a new topic under Subject > Curriculum",
      "A bit with no home yet",
    );

    const { rows } = await client.query(
      `SELECT placement_suggestion, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_suggestion).toBe("Create a new topic under Subject > Curriculum");
    expect(rows[0]!.placement_checked_at).toBeInstanceOf(Date);
  });

  it("should leave placementSuggestion and placementCheckedAt null when the body was edited after the scan read it", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      bitId,
    ]);

    await markKnowledgeBitSuggested(bitId, "A suggestion", "The original body");

    const { rows } = await client.query(
      `SELECT placement_suggestion, placement_checked_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_suggestion).toBeNull();
    expect(rows[0]!.placement_checked_at).toBeNull();
  });
});

describe("listPendingPlacementSuggestions (real Postgres)", () => {
  it("returns only bits with a suggestion, no topic, and no resolution timestamp", async () => {
    const sourceId = await seedKnowledgeSource();
    const pendingId = await seedKnowledgeBit(sourceId, 0, "A pending suggestion", null, "Try X");

    const matchedId = await seedKnowledgeBit(sourceId, 1, "A matched bit", "topic_already_matched");
    const resolvedId = await seedKnowledgeBit(
      sourceId,
      2,
      "An already-resolved suggestion",
      null,
      "Try Y",
      null,
      null,
      new Date(),
    );
    // Worst case for the failed-bit exclusion: a placementFailedAt bit that also somehow carries
    // a placementSuggestion — the isNull(placementFailedAt) filter must exclude it regardless.
    const failedId = await seedKnowledgeBit(sourceId, 3, "A failed bit", null, "Try Z", null, new Date());

    const rows = await listPendingPlacementSuggestions(1000);
    const ids = rows.map((row) => row.id);

    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(matchedId);
    expect(ids).not.toContain(resolvedId);
    expect(ids).not.toContain(failedId);
    expect(rows.find((row) => row.id === pendingId)).toEqual({
      id: pendingId,
      body: "A pending suggestion",
      placementSuggestion: "Try X",
    });
  });

  it("orders pending suggestions newest first", async () => {
    const sourceId = await seedKnowledgeSource();
    const olderId = await seedKnowledgeBit(sourceId, 0, "Older suggestion", null, "Try old");

    await new Promise((resolve) => setTimeout(resolve, 10));

    const newerId = await seedKnowledgeBit(sourceId, 1, "Newer suggestion", null, "Try new");

    const rows = await listPendingPlacementSuggestions(1000);
    const olderIndex = rows.findIndex((row) => row.id === olderId);
    const newerIndex = rows.findIndex((row) => row.id === newerId);

    expect(newerIndex).toBeLessThan(olderIndex);
  });
});

describe("resolvePlacementSuggestion (real Postgres)", () => {
  it("returns not_found for a bit id that does not exist", async () => {
    const result = await resolvePlacementSuggestion("kb_does_not_exist", "rejected");

    expect(result).toEqual({ error: "not_found" });
  });

  it("rejects a suggestion by stamping placementSuggestionResolvedAt, leaving topicId null", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to reject", null, "Try X");

    const result = await resolvePlacementSuggestion(bitId, "rejected");

    expect(result).toEqual({ outcome: "rejected" });

    const { rows } = await client.query(
      `SELECT topic_id, placement_suggestion_resolved_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.topic_id).toBeNull();
    expect(rows[0]!.placement_suggestion_resolved_at).toBeInstanceOf(Date);
  });

  it("accepts a suggestion by creating a real topic and linking the bit to it", async () => {
    const subjectId = await seedSubject("Accept Subject");
    const curriculumId = await seedCurriculum(subjectId, "Accept Curriculum");
    const moduleId = await seedModule(curriculumId, "Accept Module");

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to accept", null, "Try X");

    const result = await resolvePlacementSuggestion(bitId, "accepted", moduleId, "New Topic");

    expect(result).toMatchObject({ outcome: "accepted" });

    const topicId = (result as { outcome: "accepted"; topicId: string }).topicId;

    const { rows: topicRows } = await client.query(
      `SELECT title, module_id FROM topics WHERE id = $1`,
      [topicId],
    );

    expect(topicRows[0]!.title).toBe("New Topic");
    expect(topicRows[0]!.module_id).toBe(moduleId);

    const { rows: bitRows } = await client.query(
      `SELECT topic_id, placement_suggestion_resolved_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(bitRows[0]!.topic_id).toBe(topicId);
    expect(bitRows[0]!.placement_suggestion_resolved_at).toBeInstanceOf(Date);
  });

  it("rolls back the claim when the given moduleId does not resolve to a real module", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit with a bad module", null, "Try X");

    const result = await resolvePlacementSuggestion(
      bitId,
      "accepted",
      "mod_does_not_exist",
      "New Topic",
    );

    expect(result).toEqual({ error: "module_not_found" });

    const { rows } = await client.query(
      `SELECT topic_id, placement_suggestion_resolved_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.topic_id).toBeNull();
    expect(rows[0]!.placement_suggestion_resolved_at).toBeNull();

    const retry = await resolvePlacementSuggestion(bitId, "rejected");

    expect(retry).toEqual({ outcome: "rejected" });
  });

  it("returns already_resolved on a second call, never re-stamping the resolved timestamp", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to double-resolve", null, "Try X");

    await resolvePlacementSuggestion(bitId, "rejected");

    const { rows: firstRows } = await client.query(
      `SELECT placement_suggestion_resolved_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );
    const firstStamp = firstRows[0]!.placement_suggestion_resolved_at;

    const result = await resolvePlacementSuggestion(bitId, "rejected");

    expect(result).toEqual({ error: "already_resolved" });

    const { rows: secondRows } = await client.query(
      `SELECT placement_suggestion_resolved_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(secondRows[0]!.placement_suggestion_resolved_at).toEqual(firstStamp);
  });

  it("returns already_resolved and creates no topic when accepting after a reject", async () => {
    const subjectId = await seedSubject("Reject Then Accept Subject");
    const curriculumId = await seedCurriculum(subjectId, "Reject Then Accept Curriculum");
    const moduleId = await seedModule(curriculumId, "Reject Then Accept Module");

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit rejected then re-accepted", null, "Try X");

    await resolvePlacementSuggestion(bitId, "rejected");

    const result = await resolvePlacementSuggestion(bitId, "accepted", moduleId, "Should Not Exist");

    expect(result).toEqual({ error: "already_resolved" });

    const { rows: bitRows } = await client.query(
      `SELECT topic_id FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(bitRows[0]!.topic_id).toBeNull();

    const { rows: topicRows } = await client.query(
      `SELECT id FROM topics WHERE module_id = $1`,
      [moduleId],
    );

    expect(topicRows).toHaveLength(0);
  });

  it("returns already_resolved on an accept attempted against a bit already accepted", async () => {
    const subjectId = await seedSubject("Double Accept Subject");
    const curriculumId = await seedCurriculum(subjectId, "Double Accept Curriculum");
    const moduleId = await seedModule(curriculumId, "Double Accept Module");

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit to double-accept", null, "Try X");

    const first = await resolvePlacementSuggestion(bitId, "accepted", moduleId, "First Topic");

    expect(first).toMatchObject({ outcome: "accepted" });

    const second = await resolvePlacementSuggestion(bitId, "accepted", moduleId, "Second Topic");

    expect(second).toEqual({ error: "already_resolved" });

    const { rows: topicRows } = await client.query(
      `SELECT id FROM topics WHERE module_id = $1`,
      [moduleId],
    );

    expect(topicRows).toHaveLength(1);
  });

  it("returns invalid_input when accepting without a moduleId or title", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit missing accept fields", null, "Try X");

    const noModule = await resolvePlacementSuggestion(bitId, "accepted", undefined, "A Title");

    expect(noModule).toEqual({ error: "invalid_input" });

    const noTitle = await resolvePlacementSuggestion(bitId, "accepted", "mod_whatever", undefined);

    expect(noTitle).toEqual({ error: "invalid_input" });

    // Neither invalid attempt claimed the bit — it's still resolvable afterward.
    const rejected = await resolvePlacementSuggestion(bitId, "rejected");

    expect(rejected).toEqual({ outcome: "rejected" });
  });

  it("creates exactly one topic when two accepts race on the same bit", async () => {
    const subjectId = await seedSubject("Race Subject");
    const curriculumId = await seedCurriculum(subjectId, "Race Curriculum");
    const moduleId = await seedModule(curriculumId, "Race Module");

    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit under race", null, "Try X");

    const [first, second] = await Promise.all([
      resolvePlacementSuggestion(bitId, "accepted", moduleId, "Racer A"),
      resolvePlacementSuggestion(bitId, "accepted", moduleId, "Racer B"),
    ]);

    const outcomes = [first, second];
    const accepted = outcomes.filter(
      (result): result is { outcome: "accepted"; topicId: string } =>
        "outcome" in result && result.outcome === "accepted",
    );
    const alreadyResolved = outcomes.filter(
      (result) => "error" in result && result.error === "already_resolved",
    );

    expect(accepted).toHaveLength(1);
    expect(alreadyResolved).toHaveLength(1);

    const { rows: topicRows } = await client.query(
      `SELECT id FROM topics WHERE module_id = $1`,
      [moduleId],
    );

    expect(topicRows).toHaveLength(1);
    expect(topicRows[0]!.id).toBe(accepted[0]!.topicId);
  });
});

describe("markKnowledgeBitPlacementFailed (real Postgres)", () => {
  it("persists placementFailedAt on read-back after marking a bit placement failed", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "A bit that fails to place");

    await markKnowledgeBitPlacementFailed(bitId, "A bit that fails to place");

    const { rows } = await client.query(
      `SELECT placement_failed_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_failed_at).toBeInstanceOf(Date);
  });

  it("should leave placementFailedAt null when the body was edited after the scan read it", async () => {
    const sourceId = await seedKnowledgeSource();
    const bitId = await seedKnowledgeBit(sourceId, 0, "The original body");

    await client.query(`UPDATE knowledge_bits SET body = $1 WHERE id = $2`, [
      "The edited body",
      bitId,
    ]);

    await markKnowledgeBitPlacementFailed(bitId, "The original body");

    const { rows } = await client.query(
      `SELECT placement_failed_at FROM knowledge_bits WHERE id = $1`,
      [bitId],
    );

    expect(rows[0]!.placement_failed_at).toBeNull();
  });
});
