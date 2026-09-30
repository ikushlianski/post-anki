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

const dbName = `mcp_read_only_${randomUUID().replace(/-/g, "_")}`;
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

const { listDecks } = await import("./list-decks.tool.js");
const { listCourses } = await import("./list-courses.tool.js");
const { getCourseStructure } = await import("./get-course-structure.tool.js");
const { getTopicCards } = await import("./get-topic-cards.tool.js");
const { listCourseCards } = await import("./list-course-cards.tool.js");
const { getDeckItems } = await import("./get-deck-items.tool.js");
const { searchKnowledgeItems } = await import("./search-knowledge-items.tool.js");

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

async function tableSnapshot(): Promise<string> {
  const { rows } = await client.query<{ digest: string }>(`
    SELECT md5(
      (SELECT coalesce(string_agg(s::text, '|' ORDER BY s::text), '') FROM subjects s) ||
      (SELECT coalesce(string_agg(c::text, '|' ORDER BY c::text), '') FROM curricula c) ||
      (SELECT coalesce(string_agg(m::text, '|' ORDER BY m::text), '') FROM modules m) ||
      (SELECT coalesce(string_agg(t::text, '|' ORDER BY t::text), '') FROM topics t) ||
      (SELECT coalesce(string_agg(cs::text, '|' ORDER BY cs::text), '') FROM topic_card_sets cs) ||
      (SELECT coalesce(string_agg(tc::text, '|' ORDER BY tc::text), '') FROM topic_cards tc) ||
      (SELECT coalesce(string_agg(v::text, '|' ORDER BY v::text), '') FROM topic_card_variants v) ||
      (SELECT coalesce(string_agg(pbe::text, '|' ORDER BY pbe::text), '') FROM phrase_bank_entries pbe) ||
      (SELECT coalesce(string_agg(p::text, '|' ORDER BY p::text), '') FROM phrases p)
    ) AS digest
  `);

  return rows[0]!.digest;
}

describe("MCP tools, read-only guarantee", () => {
  it("running every tool leaves the content tables unchanged", async () => {
    const deckSubjectId = id("deck");
    const level = "B1_B2";
    const pack = "General";
    const phraseBankEntryId = id("pbentry");
    const phraseId = id("phrase");

    await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'language-practice')`, [
      deckSubjectId,
      "Spanish",
    ]);
    await client.query(
      `INSERT INTO phrase_bank_entries
         (id, subject_id, level, pack, phrase_text, status, mastery_stage, correct_count_in_cycle, incorrect_count_in_cycle)
       VALUES ($1, $2, $3, $4, 'get to the bottom of', 'practicing', 0, 0, 0)`,
      [phraseBankEntryId, deckSubjectId, level, pack],
    );
    await client.query(
      `INSERT INTO phrases
         (id, subject_id, batch_id, level, pack, position, russian, reference_english, domain, target_phrase_bank_entry_id, sequence_number)
       VALUES ($1, $2, $3, $4, $5, 1, 'Разберись с этим', 'Get to the bottom of it', 'Tech', $6, 1)`,
      [phraseId, deckSubjectId, id("batch"), level, pack, phraseBankEntryId],
    );

    const courseSubjectId = id("sub");
    const curriculumId = id("target");
    const moduleId = id("mod");
    const topicId = id("top");
    const cardSetId = id("cardset");
    const cardId = id("card");

    await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
      courseSubjectId,
      "Web",
    ]);
    await client.query(
      `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
      [curriculumId, courseSubjectId, "Closures deep dive"],
    );
    await client.query(
      `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
      [moduleId, curriculumId, "Module 1"],
    );
    await client.query(
      `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
      [topicId, moduleId, curriculumId, "Closure scoping"],
    );
    await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, 'ready')`, [
      cardSetId,
      topicId,
    ]);
    await client.query(
      `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, 'Closure basics')`,
      [cardId, cardSetId],
    );
    await client.query(
      `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer) VALUES ($1, $2, 1, $3, $4)`,
      [id("variant"), cardId, "What is a closure?", "A bundled scope."],
    );

    const before = await tableSnapshot();

    const decks = await listDecks({});
    expect(decks.items.map((d) => d.id)).toContain(deckSubjectId);

    const courses = await listCourses({});
    expect(courses.items.map((c) => c.id)).toContain(curriculumId);

    const structure = await getCourseStructure({ curriculumId });
    expect(structure?.modules).toHaveLength(1);

    const topicCards = await getTopicCards({ topicId });
    expect(topicCards?.status).toBe("ready");
    expect(topicCards?.cards).toHaveLength(1);

    const courseCards = await listCourseCards({ curriculumId });
    expect(courseCards?.items).toHaveLength(1);

    const deckItems = await getDeckItems({ subjectId: deckSubjectId });
    expect(deckItems && "items" in deckItems ? deckItems.items : []).toHaveLength(1);

    const search = await searchKnowledgeItems({ query: "closure" });
    expect(search.cards.length + search.courses.length + search.topics.length).toBeGreaterThan(0);

    const after = await tableSnapshot();

    expect(after).toBe(before);
  });
});
