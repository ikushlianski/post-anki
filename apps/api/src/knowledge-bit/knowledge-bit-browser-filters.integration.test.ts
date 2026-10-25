import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { KnowledgeBitBrowserQuery } from "@post-anki/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { closeDb } from "../db/client.js";

const BASE_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.E2E_DATABASE_URL ??
  "postgres://postanki:postanki@localhost:5578/postanki_e2e";

assertLocalDbTarget(BASE_DATABASE_URL);

const dbName = `knowledge_bit_filters_${randomUUID().replace(/-/g, "_")}`;
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

const { listKnowledgeBitBrowser } = await import("./knowledge-bit-browser.repo.js");
const { getDb } = await import("../db/client.js");

const NOW = new Date("2026-06-01T12:00:00Z");
const ids: Record<string, string> = {};
let client: pg.Client;

interface PieceSpec {
  key: string;
  prompts?: string[];
  answer?: string;
  origin?: "extracted" | "manual";
  ai?: boolean;
  source?: { url?: string | null; kind?: string; subject?: string | null };
  createdAt?: string;
  schedule?: { phase?: string; suspended?: boolean; buriedUntil?: string };
}

async function addSource(spec: NonNullable<PieceSpec["source"]>): Promise<string> {
  const id = `ksrc_${randomUUID()}`;

  await client.query(
    `INSERT INTO knowledge_sources (id, kind, raw_text, status, subject_id, source_url) VALUES ($1, $2, 'text', 'pending', $3, $4)`,
    [id, spec.kind ?? "prose", spec.subject ?? null, spec.url ?? null],
  );

  return id;
}

async function addPiece(spec: PieceSpec, sourceId?: string): Promise<void> {
  const source = sourceId ?? (await addSource(spec.source ?? {}));
  const id = `kb_${randomUUID()}`;

  ids[spec.key] = id;
  await client.query(
    `INSERT INTO knowledge_bits (id, knowledge_source_id, ordinal, body, approval_state, origin, is_ai_generated, created_at)
     VALUES ($1, $2, $3, 'body', 'approved', $4, $5, $6)`,
    [id, source, Math.floor(Math.random() * 1e6), spec.origin ?? "extracted", spec.ai ?? false, spec.createdAt ?? "2026-05-01T10:00:00Z"],
  );

  for (const [order, prompt] of (spec.prompts ?? [spec.key]).entries()) {
    await client.query(
      `INSERT INTO knowledge_bit_question_variants (id, knowledge_bit_id, kind, "order", prompt, answer) VALUES ($1, $2, 'basic', $3, $4, $5)`,
      [`kbqv_${randomUUID()}`, id, order, prompt, spec.answer ?? "plain answer"],
    );
  }

  if (spec.schedule) {
    await client.query(
      `INSERT INTO knowledge_bit_schedules (knowledge_bit_id, phase, suspended_at, buried_until) VALUES ($1, $2, $3, $4)`,
      [id, spec.schedule.phase ?? "review", spec.schedule.suspended ? NOW : null, spec.schedule.buriedUntil ?? null],
    );
  }
}

async function keysFor(query: Partial<KnowledgeBitBrowserQuery>): Promise<string[]> {
  const page = await listKnowledgeBitBrowser({ limit: 100, offset: 0, ...query }, getDb(), NOW);
  const byId = new Map(Object.entries(ids).map(([key, id]) => [id, key]));

  return page.items.map((item) => byId.get(item.knowledgeBitId) ?? "?").sort();
}

beforeAll(async () => {
  client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO subjects (id, name, parent_id) VALUES ('s_parent', 'Parent', NULL), ('s_child', 'Child', 's_parent'), ('s_other', 'Other', NULL)`,
  );
  await addPiece({ key: "typed", origin: "manual", createdAt: "2026-03-10T23:30:00Z" });
  await addPiece({ key: "pasted" });
  await addPiece({ key: "notion", source: { kind: "notion" } });
  await addPiece({ key: "wiki", source: { url: "https://en.wikipedia.org/wiki/Cat" } });
  await addPiece({ key: "wikiRoot", source: { url: "https://www.wikipedia.org/" } });
  await addPiece({ key: "notWiki", source: { url: "https://notwikipedia.org/x" } });
  await addPiece({ key: "ai", ai: true, source: { url: "https://example.com/a" } });
  await addPiece({
    key: "cards",
    prompts: ["Что такое Anki?", "Name the tool"],
    answer: "Карточки для повторения",
  });
  await addPiece({ key: "childPiece", source: { subject: "s_child" } });
  await addPiece({ key: "otherPiece", source: { subject: "s_other" } });
  await addPiece({ key: "percent", prompts: ["Gain is 100% sure"] });
  await addPiece({ key: "underscore", prompts: ["snake_case rules"] });
  await addPiece({ key: "learning", schedule: { phase: "learning" } });
  await addPiece({ key: "suspendedLearning", schedule: { phase: "learning", suspended: true } });
  await addPiece({ key: "buried", schedule: { buriedUntil: "2026-06-02T00:00:00Z" } });
  await addPiece({ key: "buriedExpired", schedule: { buriedUntil: "2026-05-30T00:00:00Z" } });
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

describe("browser filters (real Postgres)", () => {
  it("should keep pieces whose answer holds the typed letters in any case, Russian included", async () => {
    expect(await keysFor({ answer: "КАРТОЧ" })).toEqual(["cards"]);
  });

  it("should check every live phrasing of a piece for the question filter", async () => {
    expect(await keysFor({ question: "name the tool" })).toEqual(["cards"]);
  });

  it("should match percent and underscore characters literally", async () => {
    expect(await keysFor({ question: "100%" })).toEqual(["percent"]);
    expect(await keysFor({ question: "snake_case" })).toEqual(["underscore"]);
    expect(await keysFor({ question: "snake?case" })).toEqual([]);
  });

  it("should show pieces from either of two ticked source types and hide the rest", async () => {
    expect(await keysFor({ origins: ["notion", "manual"] })).toEqual(["notion", "typed"]);
  });

  it("should classify article, AI web search and pasted pieces by the shared rule", async () => {
    expect(await keysFor({ origins: ["ai_web"] })).toEqual(["ai"]);
    expect(await keysFor({ origins: ["article"] })).toEqual(["notWiki", "wiki", "wikiRoot"]);
  });

  it("should hide AI web search pieces when added by you and show nothing for you plus AI web search", async () => {
    expect(await keysFor({ addedBy: ["you"] })).not.toContain("ai");
    expect(await keysFor({ addedBy: ["ai"] })).toEqual(["ai"]);
    expect(await keysFor({ addedBy: ["you"], origins: ["ai_web"] })).toEqual([]);
  });

  it("should separate pieces with a source link from those without", async () => {
    const withLink = await keysFor({ link: "has" });
    const withoutLink = await keysFor({ link: "none" });

    expect(withLink).toEqual(["ai", "notWiki", "wiki", "wikiRoot"]);
    expect(withoutLink).toContain("typed");
    expect(withoutLink).not.toContain("wiki");
  });

  it("should match a site exactly or as a subdomain but not as a look-alike", async () => {
    expect(await keysFor({ site: "wikipedia.org", link: "has" })).toEqual(["wiki", "wikiRoot"]);
    expect(await keysFor({ site: "en.wikipedia.org" })).toEqual(["wiki"]);
  });

  it("should include a piece added late on the to day", async () => {
    expect(await keysFor({ from: "2026-03-10", to: "2026-03-10" })).toEqual(["typed"]);
    expect(await keysFor({ from: "2026-03-11", to: "2026-03-12" })).toEqual([]);
  });

  it("should list a parent subject with its sub-subjects and unfiled pieces under no subject", async () => {
    expect(await keysFor({ subjectId: "s_parent" })).toEqual(["childPiece"]);
    expect(await keysFor({ subjectId: "none" })).toContain("typed");
    expect(await keysFor({ subjectId: "none" })).not.toContain("otherPiece");
  });

  it("should count a never-studied piece as new and a suspended piece only as suspended", async () => {
    expect(await keysFor({ states: ["new"] })).toContain("typed");
    expect(await keysFor({ states: ["learning"] })).toEqual(["learning"]);
    expect(await keysFor({ states: ["suspended"] })).toEqual(["suspendedLearning"]);
  });

  it("should count a piece as buried only while the bury is still running", async () => {
    expect(await keysFor({ states: ["buried"] })).toEqual(["buried"]);
    expect(await keysFor({ states: ["review"] })).toContain("buriedExpired");
  });

  it("should apply all filters together", async () => {
    expect(
      await keysFor({ origins: ["article"], site: "wikipedia.org", question: "wiki", from: "2026-05-01" }),
    ).toEqual(["wiki", "wikiRoot"]);
  });
});

describe("browser paging and counts (real Postgres)", () => {
  it("should report the whole filtered total on every page and never repeat or skip a piece", async () => {
    const query = { origins: ["article" as const, "ai_web" as const] };
    const first = await listKnowledgeBitBrowser({ limit: 2, offset: 0, ...query }, getDb(), NOW);
    const second = await listKnowledgeBitBrowser({ limit: 2, offset: 2, ...query }, getDb(), NOW);
    const seen = [...first.items, ...second.items].map((item) => item.knowledgeBitId);

    expect(first.total).toBe(4);
    expect(second.total).toBe(4);
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(new Set(seen).size).toBe(4);
  });

  it("should report a source's real piece count even when a filter hides most of its pieces", async () => {
    const source = await addSource({ kind: "prose" });

    for (let n = 0; n < 8; n += 1) {
      await addPiece(
        { key: `big${n}`, prompts: [n < 3 ? `shown big ${n}` : `quiet ${n}`] },
        source,
      );
    }

    const page = await listKnowledgeBitBrowser({ limit: 50, offset: 0, question: "shown big" }, getDb(), NOW);

    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.sourcePieceCount)).toEqual([8, 8, 8]);
  });
});
