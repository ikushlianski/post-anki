import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";

export interface StudyPlanTestDb {
  client: pg.Client;
  databaseUrl: string;
  dispose: (closeDb: () => Promise<void>) => Promise<void>;
  seedSubject: (parentId?: string | null) => Promise<string>;
  seedCard: (subjectId: string | null) => Promise<{ bitId: string; variantId: string }>;
  seedSchedule: (bitId: string, dueAt: Date, intervalDays: number, phase?: string) => Promise<void>;
  seedBulk: (subjectId: string, total: number, dueAt: Date | null) => Promise<void>;
  reset: () => Promise<void>;
}

export async function createStudyPlanTestDb(prefix: string): Promise<StudyPlanTestDb> {
  const baseUrl =
    process.env.DATABASE_URL ??
    process.env.E2E_DATABASE_URL ??
    "postgres://postanki:postanki@localhost:5578/postanki_e2e";

  assertLocalDbTarget(baseUrl);

  const dbName = `${prefix}_${randomUUID().replace(/-/g, "_")}`;
  const url = new URL(baseUrl);

  url.pathname = `/${dbName}`;

  const adminPool = new pg.Pool({ connectionString: baseUrl });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(migratePool), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = url.toString();
  process.env.OPENROUTER_API_KEY ??= "unused-in-integration-test";

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  return {
    client,
    databaseUrl: url.toString(),
    async dispose(closeDb) {
      await client.end();
      await closeDb();
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await adminPool.end();
    },
    async reset() {
      await client.query(`DELETE FROM knowledge_bit_reviews`);
      await client.query(`DELETE FROM knowledge_bit_schedules`);
      await client.query(`DELETE FROM knowledge_bit_question_variants`);
      await client.query(`DELETE FROM knowledge_bits`);
      await client.query(`DELETE FROM knowledge_sources`);
      await client.query(`DELETE FROM subjects`);
      await client.query(`DELETE FROM app_settings`);
    },
    async seedSubject(parentId = null) {
      const id = `subj_${randomUUID()}`;

      await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ($1, $2, $3)`, [id, id, parentId]);

      return id;
    },
    async seedCard(subjectId) {
      const sourceId = `ks_${randomUUID()}`;
      const bitId = `kb_${randomUUID()}`;
      const variantId = `kbqv_${randomUUID()}`;

      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) VALUES ($1, 'prose', 'source', $2)`,
        [sourceId, subjectId],
      );
      await client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) VALUES ($1, $2, 0, 'body', 'approved')`,
        [bitId, sourceId],
      );
      await client.query(
        `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, 'Q?', 'A.')`,
        [variantId, bitId],
      );

      return { bitId, variantId };
    },
    async seedBulk(subjectId, total, dueAt) {
      const tag = randomUUID();

      await client.query(
        `INSERT INTO knowledge_sources (id, kind, raw_text, subject_id) SELECT 'ks_${tag}_' || g, 'prose', 'source', $1 FROM generate_series(1, $2) g`,
        [subjectId, total],
      );
      await client.query(
        `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state) SELECT 'kb_${tag}_' || g, 'ks_${tag}_' || g, 0, 'body', 'approved' FROM generate_series(1, $1) g`,
        [total],
      );
      await client.query(
        `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) SELECT 'kbqv_${tag}_' || g, 'kb_${tag}_' || g, 'basic', 0, 'Q?', 'A.' FROM generate_series(1, $1) g`,
        [total],
      );

      if (dueAt) {
        await client.query(
          `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count, phase) SELECT 'kb_${tag}_' || g, 2.5, 10, $2, 1, 'review' FROM generate_series(1, $1) g`,
          [total, dueAt],
        );
      }
    },
    async seedSchedule(bitId, dueAt, intervalDays, phase = "review") {
      await client.query(
        `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, ease_factor, interval_days, due_at, review_count, phase) VALUES ($1, 2.5, $2, $3, 1, $4)`,
        [bitId, intervalDays, dueAt, phase],
      );
    },
  };
}
