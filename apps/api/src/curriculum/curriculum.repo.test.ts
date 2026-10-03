import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const captured = vi.hoisted(() => ({
  inserts: [] as { discoveryTier: string | null }[][],
  selectWhere: undefined as unknown,
}));

vi.mock("../db/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/client.js")>();
  const chain = {
    insert: () => chain,
    values: (rows: unknown) => {
      captured.inserts.push(rows as { discoveryTier: string | null }[]);

      return chain;
    },
    select: () => chain,
    from: () => chain,
    where: (condition: unknown) => {
      captured.selectWhere = condition;

      return Promise.resolve([]);
    },
  };

  return { ...actual, getDb: () => chain };
});

const { insertPendingSources, listTopicIdsForCurriculum, toSource } = await import(
  "./curriculum.repo.js"
);
const { sources } = await import("../db/schema.js");

type SourceRow = typeof sources.$inferSelect;

function makeRow(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "src_1",
    curriculumId: "cur_1",
    kind: "link",
    value: "https://example.com",
    title: "Example",
    fetchedText: null,
    approvalStatus: "approved",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    lastFetchedAt: null,
    lastFetchOutcome: null,
    embedding: null,
    embeddingHash: null,
    embeddedAt: null,
    mergedFromCurriculumId: null,
    discoveryTier: null,
    ...overrides,
  };
}

describe("toSource", () => {
  it("carries a non-null discovery tier onto the Source object", () => {
    const source = toSource(makeRow({ discoveryTier: "docs_crawl" }));

    expect(source.discoveryTier).toBe("docs_crawl");
  });

  it("maps a legacy row with no discovery tier to null without throwing", () => {
    const source = toSource(makeRow({ discoveryTier: null }));

    expect(source.discoveryTier).toBeNull();
  });
});

describe("insertPendingSources", () => {
  beforeEach(() => {
    captured.inserts.length = 0;
  });

  it("persists the discovery tier a candidate was gathered with", async () => {
    await insertPendingSources("cur_1", [
      {
        kind: "llms_txt",
        url: "https://example.com/llms.txt",
        title: "llms.txt",
        fetchedText: null,
        discoveryTier: "llms_txt",
      },
    ]);

    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0]?.[0]?.discoveryTier).toBe("llms_txt");
  });

  it("stores null for a candidate with no discovery tier", async () => {
    await insertPendingSources("cur_1", [
      {
        kind: "link",
        url: "https://example.com",
        title: "Example",
        fetchedText: null,
      },
    ]);

    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0]?.[0]?.discoveryTier).toBeNull();
  });
});

describe("listTopicIdsForCurriculum", () => {
  it("scopes the query to included topics only, so excluded ones never trigger card generation", async () => {
    await listTopicIdsForCurriculum("cur_1");

    const { sql, params } = new PgDialect().sqlToQuery(captured.selectWhere as never);

    expect(sql).toContain('"included" = $2');
    expect(params).toEqual(["cur_1", true]);
  });
});
