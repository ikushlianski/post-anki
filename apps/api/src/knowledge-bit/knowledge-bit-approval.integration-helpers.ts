import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

export interface ApprovalTestDatabase {
  client: pg.Client;
  teardown: () => Promise<void>;
}

function withDatabaseName(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);

  url.pathname = `/${databaseName}`;

  return url.toString();
}

export async function startApprovalTestDatabase(): Promise<ApprovalTestDatabase> {
  const baseDatabaseUrl =
    process.env.DATABASE_URL ??
    process.env.E2E_DATABASE_URL ??
    "postgres://postanki:postanki@localhost:5578/postanki_e2e";

  assertLocalDbTarget(baseDatabaseUrl);

  const dbName = `knowledge_bit_approval_${randomUUID().replace(/-/g, "_")}`;
  const databaseUrl = withDatabaseName(baseDatabaseUrl, dbName);

  const adminPool = new pg.Pool({ connectionString: baseDatabaseUrl });
  await adminPool.query(`CREATE DATABASE ${dbName}`);

  const migratePool = new pg.Pool({ connectionString: databaseUrl });
  await migrate(drizzle(migratePool), {
    migrationsFolder: new URL("../db/migrations", import.meta.url).pathname,
    migrationsTable: "drizzle_migrations_api",
  });
  await migratePool.end();

  process.env.DATABASE_URL = databaseUrl;
  process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  return {
    client,
    teardown: async () => {
      await client.end();
      await closeDb();
      await adminPool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      );
      await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await adminPool.end();
    },
  };
}

export function createApprovalSeeders(client: pg.Client) {
  async function seedKnowledgeSource(rawText = "Some prose."): Promise<string> {
    const id = `ksrc_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_sources (id, kind, raw_text, status) VALUES ($1, 'prose', $2, 'pending')`,
      [id, rawText],
    );

    return id;
  }

  async function seedKnowledgeBit(
    knowledgeSourceId: string,
    ordinal: number,
    body: string,
    background: string | null = null,
    approvalState: "pending" | "approved" | "rejected" = "pending",
  ): Promise<string> {
    const id = `kb_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, background, approval_state)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, knowledgeSourceId, ordinal, body, background, approvalState],
    );

    return id;
  }

  async function seedQuestionVariant(
    knowledgeBitId: string,
    kind: string,
    order: number,
    prompt = "A prompt",
    answer = "An answer",
  ): Promise<string> {
    const id = `kbqv_${randomUUID()}`;

    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, knowledgeBitId, kind, order, prompt, answer],
    );

    return id;
  }

  return { seedKnowledgeSource, seedKnowledgeBit, seedQuestionVariant };
}
