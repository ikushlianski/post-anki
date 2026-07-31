import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

// cross-course-refocus-suggestion (issue #70), SCENARIOS 7, 11, 14 — proves
// the repo layer's language-practice exclusion (Scenario 7) while that same
// subject's phrase-bank activity still counts toward the global "still
// active" gate (Scenario 14), and the compound-key dismiss upsert (Scenario
// 11). Scenario 10's "small, fixed number of reads" claim is verified by
// code review of the implementation (four queries total), not a runtime
// query-count assertion here — this repo's DB tests run against a real
// local Postgres, not a mockable client (see spec.md's Definition of Done).
//
// Same fresh-migrated-throwaway-Postgres technique as curriculum.repo.test.ts
// / decide.repo.test.ts: real inserts/selects against a real Postgres
// instance, not a mocked repo shape.
//
// Kept at this exact path (not *.integration.test.ts) because spec.md's
// Backend DoD pins this precise command
// `npx vitest run apps/api/src/curriculum/course-refocus.repo.test.ts`;
// vitest.config.ts's exclude list carries this filename as a named
// exception, same as curriculum.repo.test.ts / decide.repo.test.ts.

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

const dbName = `course_refocus_repo_${randomUUID().replace(/-/g, "_")}`;
const testDatabaseUrl = withDatabaseName(BASE_DATABASE_URL, dbName);

let adminPool: pg.Pool;
let client: pg.Client;

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

  client = new pg.Client({ connectionString: testDatabaseUrl });
  await client.connect();
}, 60_000);

afterAll(async () => {
  await client?.end();

  const { closeDb } = await import("../db/client.js");
  await closeDb();

  await adminPool.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [dbName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
  await adminPool.end();
});

beforeEach(async () => {
  await client.query(
    `TRUNCATE subjects, curricula, topics, phrase_bank_entries, course_refocus_dismissals RESTART IDENTITY CASCADE`,
  );
});

function daysBefore(days: number): Date {
  const date = new Date();

  date.setUTCDate(date.getUTCDate() - days);

  return date;
}

async function insertSubject(id: string, name: string, kind: string): Promise<void> {
  await client.query(
    `INSERT INTO subjects (id, name, require_sources, kind) VALUES ($1, $2, false, $3)`,
    [id, name, kind],
  );
}

async function insertCurriculum(input: {
  id: string;
  subjectId: string;
  name: string;
  order: number;
  createdAt?: Date;
  learningStatus?: string;
}): Promise<void> {
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status, learning_status, speed, hinting,
      default_depth, strict_order, "order", created_at)
     VALUES ($1, $2, $3, 'confirmed', $4, 'normal', true, 'working', false, $5, $6)`,
    [
      input.id,
      input.subjectId,
      input.name,
      input.learningStatus ?? "not_started",
      input.order,
      input.createdAt ?? daysBefore(365),
    ],
  );
}

async function insertTopic(input: {
  id: string;
  curriculumId: string;
  lastInteractedAt: Date | null;
}): Promise<void> {
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order", progress_last_interacted_at)
     VALUES ($1, 'mod_test', $2, 'Topic', 1, $3)`,
    [input.id, input.curriculumId, input.lastInteractedAt],
  );
}

async function insertPhraseBankEntry(input: {
  id: string;
  subjectId: string;
  lastCorrectDate: Date;
}): Promise<void> {
  await client.query(
    `INSERT INTO phrase_bank_entries (id, subject_id, level, pack, phrase_text, last_correct_date, updated_at)
     VALUES ($1, $2, 'B1_B2', 'General', 'phrase', $3, $3)`,
    [input.id, input.subjectId, input.lastCorrectDate],
  );
}

describe("listCourseRefocusSuggestions", () => {
  describe("SCENARIO 7 — language-practice subjects are never scanned", () => {
    it("never surfaces a language-practice subject's courses regardless of staleness", async () => {
      const { listCourseRefocusSuggestions } = await import("./course-refocus.repo.js");

      await insertSubject("sub_lang", "Spanish", "language-practice");
      await insertCurriculum({
        id: "cur_lang",
        subjectId: "sub_lang",
        name: "Spanish Basics",
        order: 1,
        createdAt: daysBefore(365),
      });
      await insertTopic({
        id: "top_lang",
        curriculumId: "cur_lang",
        lastInteractedAt: daysBefore(30),
      });
      // Global "still active" gate needs something recent so the gate
      // itself doesn't suppress everything before the subject-kind filter
      // is even reached.
      await insertPhraseBankEntry({
        id: "phr_1",
        subjectId: "sub_lang",
        lastCorrectDate: daysBefore(1),
      });

      const suggestions = await listCourseRefocusSuggestions();

      expect(suggestions).toEqual([]);
    });
  });

  describe("SCENARIO 14 — phrase-bank drilling counts as still active for the global gate", () => {
    it("lets a stale course in another subject surface when the ONLY recent activity anywhere is phrase-bank drilling", async () => {
      const { listCourseRefocusSuggestions } = await import("./course-refocus.repo.js");

      await insertSubject("sub_lang", "Spanish", "language-practice");
      await insertPhraseBankEntry({
        id: "phr_1",
        subjectId: "sub_lang",
        lastCorrectDate: daysBefore(2),
      });

      await insertSubject("sub_arch", "Backend Engineering", "architecture-mentor");
      await insertCurriculum({
        id: "cur_arch",
        subjectId: "sub_arch",
        name: "Distributed Systems",
        order: 1,
        createdAt: daysBefore(365),
      });
      await insertTopic({
        id: "top_arch",
        curriculumId: "cur_arch",
        lastInteractedAt: daysBefore(20),
      });

      const suggestions = await listCourseRefocusSuggestions();

      expect(suggestions).toEqual([
        {
          curriculumId: "cur_arch",
          subjectId: "sub_arch",
          curriculumName: "Distributed Systems",
          subjectName: "Backend Engineering",
          reason: "stale_top_priority",
          daysSinceActivity: 20,
        },
      ]);
    });
  });
});

describe("dismissCourseRefocusSuggestion", () => {
  describe("SCENARIO 11 — dismissal write is idempotent and scoped correctly", () => {
    it("leaves exactly one row with the later dismissedAt when called twice for the same pair", async () => {
      const { dismissCourseRefocusSuggestion } = await import("./course-refocus.repo.js");

      await insertSubject("sub_arch", "Backend Engineering", "architecture-mentor");
      await insertCurriculum({
        id: "cur_arch",
        subjectId: "sub_arch",
        name: "Distributed Systems",
        order: 1,
      });

      await dismissCourseRefocusSuggestion("cur_arch", "stale_top_priority");

      const firstRows = await client.query(
        `SELECT dismissed_at FROM course_refocus_dismissals WHERE curriculum_id = $1 AND reason = $2`,
        ["cur_arch", "stale_top_priority"],
      );

      expect(firstRows.rowCount).toBe(1);
      const firstDismissedAt = firstRows.rows[0].dismissed_at as Date;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await dismissCourseRefocusSuggestion("cur_arch", "stale_top_priority");

      const secondRows = await client.query(
        `SELECT dismissed_at FROM course_refocus_dismissals WHERE curriculum_id = $1 AND reason = $2`,
        ["cur_arch", "stale_top_priority"],
      );

      expect(secondRows.rowCount).toBe(1);
      const secondDismissedAt = secondRows.rows[0].dismissed_at as Date;

      expect(secondDismissedAt.getTime()).toBeGreaterThan(firstDismissedAt.getTime());
    });

    it("keeps independent rows for different reasons on the same curriculum", async () => {
      const { dismissCourseRefocusSuggestion } = await import("./course-refocus.repo.js");

      await insertSubject("sub_arch", "Backend Engineering", "architecture-mentor");
      await insertCurriculum({
        id: "cur_arch",
        subjectId: "sub_arch",
        name: "Distributed Systems",
        order: 1,
      });

      await dismissCourseRefocusSuggestion("cur_arch", "stale_top_priority");
      await dismissCourseRefocusSuggestion("cur_arch", "new_high_priority_ignored");

      const rows = await client.query(
        `SELECT reason FROM course_refocus_dismissals WHERE curriculum_id = $1 ORDER BY reason`,
        ["cur_arch"],
      );

      expect(rows.rowCount).toBe(2);
    });
  });
});
