import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { KnowledgeBitOverviewQuery } from "@post-anki/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_bit_overview_filters_${randomUUID().replace(/-/g, "_")}`;
const databaseUrl = new URL(BASE_DATABASE_URL);

databaseUrl.pathname = `/${dbName}`;

const DATABASE_URL = databaseUrl.toString();
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

const { listKnowledgeBitOverview } = await import("./knowledge-bit-overview.repo.js");
const { getDb } = await import("../db/client.js");

const NOW = new Date("2026-06-01T12:00:00Z");
const ids: Record<string, string> = {};
let client: pg.Client;

interface PieceSpec {
  key: string;
  question?: string;
  origin?: "extracted" | "manual";
  ai?: boolean;
  source?: { url?: string; kind?: string; subject?: string };
  schedule?: { phase?: string; suspended?: boolean; buriedUntil?: string };
  createdAt: string;
}

async function addPiece(spec: PieceSpec): Promise<void> {
  const sourceId = `ksrc_${randomUUID()}`;
  const id = `kb_${randomUUID()}`;

  ids[spec.key] = id;
  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, source_url) VALUES ($1, $2, 'text', 'pending', $3, $4)`,
    [sourceId, spec.source?.kind ?? "prose", spec.source?.subject ?? null, spec.source?.url ?? null],
  );
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, is_ai_generated, created_at)
     VALUES ($1, $2, $3, 'body', 'approved', $4, $5, $6)`,
    [id, sourceId, Math.floor(Math.random() * 1e6), spec.origin ?? "extracted", spec.ai ?? false, spec.createdAt],
  );
  await client.query(
    `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', 0, $3, 'plain answer')`,
    [`kbqv_${randomUUID()}`, id, spec.question ?? spec.key],
  );

  if (spec.schedule) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, phase, suspended_at, buried_until) VALUES ($1, $2, $3, $4)`,
      [id, spec.schedule.phase ?? "review", spec.schedule.suspended ? NOW : null, spec.schedule.buriedUntil ?? null],
    );
  }
}

async function overview(query: Partial<KnowledgeBitOverviewQuery>) {
  const page = await listKnowledgeBitOverview({ limit: 100, offset: 0, ...query }, NOW, getDb());
  const byId = new Map(Object.entries(ids).map(([key, id]) => [id, key]));

  return { keys: page.items.map((item) => byId.get(item.knowledgeBitId) ?? "?"), page };
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(`INSERT INTO subjects (id, name, parent_id) VALUES ('s_a', 'A', NULL), ('s_b', 'B', NULL)`);

  const specs: Omit<PieceSpec, "createdAt">[] = [
    { key: "typed", origin: "manual" },
    { key: "pasted" },
    { key: "notion", source: { kind: "notion" } },
    { key: "article", source: { url: "https://example.com/a" } },
    { key: "ai", ai: true },
    { key: "learning", schedule: { phase: "learning" } },
    { key: "relearning", schedule: { phase: "relearning" } },
    { key: "review", schedule: { phase: "review" } },
    { key: "suspended", schedule: { phase: "review", suspended: true } },
    { key: "buried", schedule: { buriedUntil: "2026-06-02T00:00:00Z" } },
    { key: "buriedPast", schedule: { buriedUntil: "2026-05-30T00:00:00Z" } },
    { key: "nginxA", question: "nginx in A", source: { subject: "s_a" }, schedule: { phase: "learning" } },
    { key: "nginxB", question: "nginx in B", source: { subject: "s_b" }, schedule: { phase: "learning" } },
  ];

  for (const [index, spec] of specs.entries()) {
    await addPiece({ ...spec, createdAt: new Date(Date.UTC(2026, 4, 1, 0, 0, specs.length - index)).toISOString() });
  }
}, 60_000);

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

describe("overview state and origin filters (real Postgres)", () => {
  it("should list every approved card when no state or origin is given", async () => {
    expect((await overview({})).keys).toHaveLength(13);
  });

  it("should show only the chosen study states, with an expired bury counting as review", async () => {
    expect((await overview({ states: ["learning", "relearning"] })).keys.sort()).toEqual([
      "learning",
      "nginxA",
      "nginxB",
      "relearning",
    ]);
    expect((await overview({ states: ["suspended"] })).keys).toEqual(["suspended"]);
    expect((await overview({ states: ["buried"] })).keys).toEqual(["buried"]);
    expect((await overview({ states: ["review"] })).keys).toContain("buriedPast");
    expect((await overview({ states: ["new"] })).keys).toContain("typed");
  });

  it("should agree with the state shown on each returned card", async () => {
    for (const state of ["new", "learning", "review", "relearning", "suspended", "buried"] as const) {
      const { page } = await overview({ states: [state] });

      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.every((item) => item.state === state)).toBe(true);
    }
  });

  it("should classify each origin the way the browser does", async () => {
    expect((await overview({ origins: ["manual"] })).keys).toEqual(["typed"]);
    expect((await overview({ origins: ["ai_web"] })).keys).toEqual(["ai"]);
    expect((await overview({ origins: ["notion"] })).keys).toEqual(["notion"]);
    expect((await overview({ origins: ["article"] })).keys).toEqual(["article"]);
    expect((await overview({ origins: ["pasted"] })).keys).toContain("pasted");
  });

  it("should require state, origin, subject and search text to all match", async () => {
    expect((await overview({ states: ["learning"], subjectId: "s_a", q: "nginx" })).keys).toEqual(["nginxA"]);
    expect((await overview({ states: ["learning"], origins: ["manual"] })).keys).toEqual([]);
  });

  it("should page the filtered set and report more only while filtered cards remain", async () => {
    const first = await overview({ states: ["learning", "relearning"], limit: 3 });
    const second = await overview({ states: ["learning", "relearning"], limit: 3, offset: 3 });

    expect(first.keys).toHaveLength(3);
    expect(first.page.hasMore).toBe(true);
    expect(second.keys).toHaveLength(1);
    expect(second.page.hasMore).toBe(false);
  });
});
