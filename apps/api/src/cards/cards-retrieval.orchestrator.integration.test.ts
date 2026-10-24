import { randomUUID } from "node:crypto";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalDbTarget } from "../db/assert-local-db-target.js";
import { rankBySimilarity } from "@post-anki/core";
import { closeDb } from "../db/client.js";
import { padEmbedding } from "../db/pad-embedding.js";

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

const dbName = `cards_retrieval_orch_${randomUUID().replace(/-/g, "_")}`;
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
process.env.OPENROUTER_API_KEY = "e2e-dummy-key";

const { findTopMatchingCards } = await import("./cards-retrieval.orchestrator.js");

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

function jsonAndVector(embedding: number[] | null): [string | null, string | null] {
  if (!embedding) {
    return [null, null];
  }

  const padded = JSON.stringify(padEmbedding(embedding));

  return [padded, padded];
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

interface SeededCardVariant {
  variantId: string;
  topicId: string;
  curriculumId: string;
  subjectId: string;
}

async function seedTopicWithCardVariant(
  prompt: string,
  answer: string,
  embedding: number[] | null,
): Promise<SeededCardVariant> {
  const subjectId = id("subj");
  const curriculumId = id("curr");
  const moduleId = id("mod");
  const topicId = id("top");
  const cardSetId = id("cardset");
  const cardId = id("card");
  const variantId = id("variant");

  await client.query(`INSERT INTO subjects (id, name, kind) VALUES ($1, $2, 'architecture-mentor')`, [
    subjectId,
    "Retrieval test subject",
  ]);
  await client.query(
    `INSERT INTO curricula (id, subject_id, name, status) VALUES ($1, $2, $3, 'confirmed')`,
    [curriculumId, subjectId, "Course"],
  );
  await client.query(`INSERT INTO modules (id, curriculum_id, title, "order") VALUES ($1, $2, $3, 1)`, [
    moduleId,
    curriculumId,
    "Module 1",
  ]);
  await client.query(
    `INSERT INTO topics (id, module_id, curriculum_id, title, "order") VALUES ($1, $2, $3, $4, 1)`,
    [topicId, moduleId, curriculumId, "Topic 1"],
  );
  await client.query(`INSERT INTO topic_card_sets (id, topic_id, status) VALUES ($1, $2, 'ready')`, [
    cardSetId,
    topicId,
  ]);
  await client.query(
    `INSERT INTO topic_cards (id, card_set_id, "order", concept) VALUES ($1, $2, 1, $3)`,
    [cardId, cardSetId, "Concept"],
  );
  await client.query(
    `INSERT INTO topic_card_variants (id, card_id, "order", prompt, answer, embedding, embedding_vec)
     VALUES ($1, $2, 1, $3, $4, $5, $6)`,
    [variantId, cardId, prompt, answer, ...jsonAndVector(embedding)],
  );

  return { variantId, topicId, curriculumId, subjectId };
}

async function tagNode(nodeType: string, nodeId: string, tagName: string): Promise<void> {
  const tagId = id("tag");

  await client.query(`INSERT INTO tags (id, name, normalized_name) VALUES ($1, $2, $3)`, [
    tagId,
    tagName,
    tagName.toLowerCase(),
  ]);
  await client.query(
    `INSERT INTO tag_assignments (id, tag_id, node_type, node_id) VALUES ($1, $2, $3, $4)`,
    [id("tagassign"), tagId, nodeType, nodeId],
  );
}

async function tagTopic(topicId: string, tagName: string): Promise<void> {
  await tagNode("topic", topicId, tagName);
}

async function mapDomainNode(
  curriculumId: string,
  subjectId: string,
  nodeName: string,
  status: "confirmed" | "pending" | "rejected",
): Promise<void> {
  const domainNodeId = id("domainnode");

  await client.query(`INSERT INTO domain_nodes (id, subject_id, name) VALUES ($1, $2, $3)`, [
    domainNodeId,
    subjectId,
    nodeName,
  ]);
  await client.query(
    `INSERT INTO curriculum_domain_node_mappings (id, curriculum_id, domain_node_id, status)
     VALUES ($1, $2, $3, $4)`,
    [id("mapping"), curriculumId, domainNodeId, status],
  );
}

async function confirmDomainMapping(
  curriculumId: string,
  subjectId: string,
  nodeName: string,
): Promise<void> {
  await mapDomainNode(curriculumId, subjectId, nodeName, "confirmed");
}

async function seedFact(body: string, embedding: number[] | null, tags: string[] = []): Promise<string> {
  const factId = id("fact");

  await client.query(
    `INSERT INTO facts (id, body, source, source_ref, tags, embedding, embedding_vec)
     VALUES ($1, $2, 'notion', $3, $4, $5, $6)`,
    [factId, body, `notion:${factId}`, JSON.stringify(tags), ...jsonAndVector(embedding)],
  );

  return factId;
}

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const init = args[1];
    const body = JSON.parse(String(init?.body)) as { input: string[]; model: string };
    const data = body.input.map((_text, index) => ({ index, embedding: padEmbedding([1, 0]) }));

    return new Response(JSON.stringify({ data, model: body.model }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("findTopMatchingCards", () => {
  it("makes no embedding call when no variants are embedded yet", async () => {
    await seedTopicWithCardVariant("Not embedded", "Answer", null);

    const results = await findTopMatchingCards("anything", 10);

    expect(results).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("ranks the closest-matching card highest", async () => {
    const close = await seedTopicWithCardVariant("What is a closure?", "A bundled scope.", [1, 0]);
    const far = await seedTopicWithCardVariant("What is CSS?", "Styling language.", [0, 1]);

    const results = await findTopMatchingCards("closures", 10);

    expect(results[0]!.variantId).toBe(close.variantId);
    expect(results.map((r) => r.variantId)).toContain(far.variantId);
    expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
  });

  it("caps results at topK", async () => {
    await seedTopicWithCardVariant("Q1", "A1", [1, 0]);
    await seedTopicWithCardVariant("Q2", "A2", [1, 0]);
    await seedTopicWithCardVariant("Q3", "A3", [1, 0]);

    const results = await findTopMatchingCards("anything", 2);

    expect(results).toHaveLength(2);
  });

  it("excludes variants with no embedding yet", async () => {
    const embedded = await seedTopicWithCardVariant("Embedded", "Answer", [1, 0]);
    const unembedded = await seedTopicWithCardVariant("Not embedded 2", "Answer", null);

    const results = await findTopMatchingCards("anything", 1000);
    const ids = results.map((r) => r.variantId);

    expect(ids).toContain(embedded.variantId);
    expect(ids).not.toContain(unembedded.variantId);
  });

  it("carries a card's subject, tags, and confirmed domain node alongside its topic", async () => {
    const tagged = await seedTopicWithCardVariant("What is a promise?", "A future value.", [1, 0]);

    await tagTopic(tagged.topicId, "javascript");
    await confirmDomainMapping(tagged.curriculumId, tagged.subjectId, "Async programming");

    const results = await findTopMatchingCards("promise", 10);
    const match = results.find((r) => r.variantId === tagged.variantId);

    expect(match?.subjectId).toBe(tagged.subjectId);
    expect(match?.subjectName).toBe("Retrieval test subject");
    expect(match?.tags).toEqual(["javascript"]);
    expect(match?.domainNodeNames).toEqual(["Async programming"]);
  });

  it("returns empty tags and no domain nodes when neither exists", async () => {
    const bare = await seedTopicWithCardVariant("What is a symbol?", "A unique primitive.", [1, 0]);

    const results = await findTopMatchingCards("symbol", 10);
    const match = results.find((r) => r.variantId === bare.variantId);

    expect(match?.subjectId).toBe(bare.subjectId);
    expect(match?.tags).toEqual([]);
    expect(match?.domainNodeNames).toEqual([]);
  });

  it("excludes a tag assigned under a different node type, even at the same node id", async () => {
    const seeded = await seedTopicWithCardVariant("What is a module?", "A unit of code.", [1, 0]);

    await tagNode("module", seeded.topicId, "module-scoped-tag");

    const results = await findTopMatchingCards("module", 10);
    const match = results.find((r) => r.variantId === seeded.variantId);

    expect(match?.tags).toEqual([]);
  });

  it("excludes a domain-node mapping that isn't confirmed", async () => {
    const seeded = await seedTopicWithCardVariant("What is pending?", "Not yet confirmed.", [1, 0]);

    await mapDomainNode(seeded.curriculumId, seeded.subjectId, "Pending node", "pending");

    const results = await findTopMatchingCards("pending", 10);
    const match = results.find((r) => r.variantId === seeded.variantId);

    expect(match?.domainNodeNames).toEqual([]);
  });

  it("surfaces every confirmed domain node for a curriculum, in a stable sorted order", async () => {
    const seeded = await seedTopicWithCardVariant("What is a tree?", "A hierarchy.", [1, 0]);

    await confirmDomainMapping(seeded.curriculumId, seeded.subjectId, "Zeta node");
    await confirmDomainMapping(seeded.curriculumId, seeded.subjectId, "Alpha node");

    const first = await findTopMatchingCards("tree", 10);
    const second = await findTopMatchingCards("tree", 10);
    const firstMatch = first.find((r) => r.variantId === seeded.variantId);
    const secondMatch = second.find((r) => r.variantId === seeded.variantId);

    expect(firstMatch?.domainNodeNames).toEqual(["Alpha node", "Zeta node"]);
    expect(secondMatch?.domainNodeNames).toEqual(["Alpha node", "Zeta node"]);
  });

  it("surfaces every tag on a topic, in a stable sorted order", async () => {
    const seeded = await seedTopicWithCardVariant("What is a set?", "A unique collection.", [1, 0]);

    await tagTopic(seeded.topicId, "zeta-tag");
    await tagTopic(seeded.topicId, "alpha-tag");

    const first = await findTopMatchingCards("set", 100);
    const second = await findTopMatchingCards("set", 100);
    const firstMatch = first.find((r) => r.variantId === seeded.variantId);
    const secondMatch = second.find((r) => r.variantId === seeded.variantId);

    expect(firstMatch?.tags).toEqual(["alpha-tag", "zeta-tag"]);
    expect(secondMatch?.tags).toEqual(["alpha-tag", "zeta-tag"]);
  });

  it("ranks a matching reading note above an unrelated card and marks it as a fact", async () => {
    const factId = await seedFact("Anchor the middle plan on a pricing page", [1, 0], ["SPA"]);
    const far = await seedTopicWithCardVariant("What is CSS grid?", "A layout system.", [0, 1]);

    const results = await findTopMatchingCards("pricing page layout", 100);
    const factMatch = results.find((r) => r.variantId === factId);
    const cardMatch = results.find((r) => r.variantId === far.variantId);

    expect(factMatch).toEqual({
      variantId: factId,
      kind: "fact",
      prompt: "Anchor the middle plan on a pricing page",
      answer: "",
      topicId: "facts",
      topicTitle: "Reading notes",
      similarity: 1,
      subjectId: "",
      subjectName: "",
      tags: ["SPA"],
      domainNodeNames: [],
    });
    expect(cardMatch?.kind).toBe("card");
    expect(results.indexOf(factMatch!)).toBeLessThan(results.indexOf(cardMatch!));
  });

  it("excludes a reading note that has no embedding yet", async () => {
    const factId = await seedFact("Not yet embedded", null);

    const results = await findTopMatchingCards("anything", 100);

    expect(results.map((r) => r.variantId)).not.toContain(factId);
  });

  it("returns the same ids, order and similarities as the old in-memory ranking on fixed vectors", async () => {
    const fixed: Record<string, number[]> = {
      closest: [0.9, 0.1, 0.05],
      close: [0.7, 0.5, 0.1],
      middling: [0.5, 0.8, 0.3],
      belowThreshold: [0.05, 0.1, 0.99],
      opposite: [-1, -0.2, 0],
    };
    const query = [1, 0.2, 0.1];
    const idsByName = new Map<string, string>();

    for (const [name, vector] of Object.entries(fixed)) {
      const seeded = await seedTopicWithCardVariant(name, "A", vector);

      idsByName.set(seeded.variantId, name);
    }

    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: padEmbedding(query) }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const expected = rankBySimilarity(
      padEmbedding(query),
      Object.entries(fixed).map(([name, vector]) => ({ name, embedding: padEmbedding(vector) })),
      1000,
      0.3,
    );
    const results = (await findTopMatchingCards("fixed", 1000, 0.3)).filter((r) =>
      idsByName.has(r.variantId),
    );

    expect(results.map((r) => idsByName.get(r.variantId))).toEqual(expected.map((e) => e.name));
    results.forEach((r, i) => expect(r.similarity).toBeCloseTo(expected[i]!.similarity, 5));
    expect(results.map((r) => r.prompt)).not.toContain("belowThreshold");
  });
});
