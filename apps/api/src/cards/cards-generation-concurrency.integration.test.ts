import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const dbName = `cards_gen_conc_${randomUUID().replace(/-/g, "_")}`;
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

const mockAgentGenerate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { cardsCompiler: "cardsCompiler" },
  getMastra: () => ({ getAgent: () => ({ generate: mockAgentGenerate }) }),
}));

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../shared/embeddings-client.js", () => ({
  embedTexts: vi.fn(async () => []),
}));

const mockSend = vi.fn(async (_events: unknown) => ({ ids: [] }));

vi.mock("../shared/inngest-client.js", () => ({
  createInngestClient: () => ({ send: (events: unknown) => mockSend(events) }),
}));

const { failStaleGeneratingCards, touchGeneratingCards } = await import("./cards.repo.js");
const { maybeStartCardsInBackground, startCardsManually } = await import("./cards.orchestrator.js");

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

beforeEach(() => {
  vi.clearAllMocks();
});

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

async function seedTopic(): Promise<string> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("topic");

  await client.query(
    `INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`,
    [subjectId, "Concurrency test subject"],
  );
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Concurrency test curriculum"],
  );
  await client.query(
    `INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`,
    [moduleId, curriculumId, "Concurrency test module"],
  );
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order")
     VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Concurrency test topic"],
  );

  return topicId;
}

async function cardSetStatus(topicId: string): Promise<string | undefined> {
  const { rows } = await client.query(
    `SELECT status FROM topic_card_sets WHERE topic_id = $1`,
    [topicId],
  );

  return rows[0]?.status as string | undefined;
}

async function seedCardSet(topicId: string, status: string, updatedAt: Date): Promise<void> {
  await client.query(
    `INSERT INTO topic_card_sets (id, topic_id, status, updated_at) VALUES ($1, $2, $3, $4)`,
    [id("cardset"), topicId, status, updatedAt],
  );
}

describe("maybeStartCardsInBackground under concurrency (real Postgres)", () => {
  it("dispatches exactly one generation when two triggers land for the same topic at once", async () => {
    const topicId = await seedTopic();

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await Promise.all([
      maybeStartCardsInBackground(topicId),
      maybeStartCardsInBackground(topicId),
    ]);

    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch a second generation once a card set already exists for the topic", async () => {
    const topicId = await seedTopic();

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await maybeStartCardsInBackground(topicId);
    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);

    mockAgentGenerate.mockClear();

    await maybeStartCardsInBackground(topicId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });

  it("resolves every call and generates exactly once per topic when 6 distinct topics fire at once, past the pool's max of 4", async () => {
    const topicIds = await Promise.all(Array.from({ length: 6 }, () => seedTopic()));

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await Promise.all(topicIds.map((topicId) => maybeStartCardsInBackground(topicId)));

    await vi.waitFor(
      async () => {
        for (const topicId of topicIds) {
          expect(await cardSetStatus(topicId)).toBe("ready");
        }
      },
      { timeout: 15_000 },
    );

    expect(mockAgentGenerate).toHaveBeenCalledTimes(6);
  }, 20_000);
});

describe("maybeStartCardsInBackground recovering from a crashed run (real Postgres)", () => {
  it("still blocks a new trigger while a 'generating' row is recent", async () => {
    const topicId = await seedTopic();

    await seedCardSet(topicId, "generating", new Date());

    await maybeStartCardsInBackground(topicId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockAgentGenerate).not.toHaveBeenCalled();
    expect(await cardSetStatus(topicId)).toBe("generating");
  });

  it("treats a 'generating' row older than the staleness threshold as retriable", async () => {
    const topicId = await seedTopic();

    await seedCardSet(topicId, "generating", new Date(Date.now() - 60 * 60 * 1000));

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await maybeStartCardsInBackground(topicId);

    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("startCardsManually alongside a background-triggered run (real Postgres)", () => {
  it("does not start a second compileCards call while a background run is already in progress", async () => {
    const topicId = await seedTopic();

    let resolveGenerate!: (value: unknown) => void;
    mockAgentGenerate.mockImplementation(
      () => new Promise((resolve) => (resolveGenerate = resolve)),
    );

    await maybeStartCardsInBackground(topicId);
    await vi.waitFor(() => expect(mockAgentGenerate).toHaveBeenCalledTimes(1));

    const manualResult = await startCardsManually(topicId);

    expect(manualResult.alreadyInProgress).toBe(true);
    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);

    resolveGenerate({ object: { cards: [{ concept: "Concept A", variants: [] }] } });
    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });
  });

  it("starts exactly one generation when both race for the same topic at once", async () => {
    const topicId = await seedTopic();

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await Promise.all([maybeStartCardsInBackground(topicId), startCardsManually(topicId)]);

    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });

    expect(mockAgentGenerate).toHaveBeenCalledTimes(1);
  });

  it("still regenerates on a manual click against an already-ready card set", async () => {
    const topicId = await seedTopic();

    mockAgentGenerate.mockResolvedValue({
      object: { cards: [{ concept: "Concept A", variants: [] }] },
    });

    await startCardsManually(topicId);
    await vi.waitFor(async () => {
      expect(await cardSetStatus(topicId)).toBe("ready");
    });

    const result = await startCardsManually(topicId);

    expect(result.alreadyInProgress).toBe(false);
    await vi.waitFor(() => expect(mockAgentGenerate).toHaveBeenCalledTimes(2));
  });
});

describe("claim semantics with the durable flag on (real Postgres)", () => {
  it("should claim once, send one event, and block a manual click while the run is in flight", async () => {
    process.env.DURABLE_CARDS = "1";

    try {
      const topicId = await seedTopic();

      await Promise.all([maybeStartCardsInBackground(topicId), maybeStartCardsInBackground(topicId)]);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockAgentGenerate).not.toHaveBeenCalled();
      expect(await cardSetStatus(topicId)).toBe("generating");

      const manual = await startCardsManually(topicId);

      expect(manual.alreadyInProgress).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.DURABLE_CARDS;
    }
  });

  it("should fall back to in-process generation when the event cannot be sent", async () => {
    process.env.DURABLE_CARDS = "1";

    try {
      const topicId = await seedTopic();

      mockSend.mockRejectedValueOnce(new Error("inngest down"));
      mockAgentGenerate.mockResolvedValue({
        object: { cards: [{ concept: "Concept A", variants: [] }] },
      });

      await maybeStartCardsInBackground(topicId);

      await vi.waitFor(async () => {
        expect(await cardSetStatus(topicId)).toBe("ready");
      });
    } finally {
      delete process.env.DURABLE_CARDS;
    }
  });
});

describe("stale generating cleanup and begin touch (real Postgres)", () => {
  it("should fail only generating sets older than the cutoff and leave recent and ready ones", async () => {
    const stale = await seedTopic();
    const recent = await seedTopic();
    const ready = await seedTopic();

    await seedCardSet(stale, "generating", new Date(Date.now() - 20 * 60 * 1000));
    await seedCardSet(recent, "generating", new Date());
    await seedCardSet(ready, "ready", new Date(Date.now() - 20 * 60 * 1000));

    await failStaleGeneratingCards(10 * 60 * 1000);

    expect(await cardSetStatus(stale)).toBe("failed");
    expect(await cardSetStatus(recent)).toBe("generating");
    expect(await cardSetStatus(ready)).toBe("ready");
  });

  it("should refresh a generating claim so a queued job is not reclaimed, and report false otherwise", async () => {
    const queued = await seedTopic();
    const failed = await seedTopic();

    await seedCardSet(queued, "generating", new Date(Date.now() - 14 * 60 * 1000));
    await seedCardSet(failed, "failed", new Date());

    expect(await touchGeneratingCards(queued)).toBe(true);
    expect(await touchGeneratingCards(failed)).toBe(false);

    await maybeStartCardsInBackground(queued);

    expect(mockSend).not.toHaveBeenCalled();
    expect(mockAgentGenerate).not.toHaveBeenCalled();
  });
});
