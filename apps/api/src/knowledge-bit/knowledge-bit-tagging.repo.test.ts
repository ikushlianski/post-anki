import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface BitRow {
  id: string;
  body: string;
  taggedAt: Date | null;
  tagFailedAt: Date | null;
  createdAt: Date;
}

const mockDbState = {
  bits: [] as BitRow[],
};

const dialect = new PgDialect();

function renderSql(node: unknown): string {
  return dialect.sqlToQuery(node as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

function extractEqId(cond: unknown): string | undefined {
  const match = renderSql(cond).match(/"id" = \$(\d+)/);

  if (!match) {
    return undefined;
  }

  const paramIndex = Number(match[1]) - 1;
  const params = dialect.sqlToQuery(cond as Parameters<PgDialect["sqlToQuery"]>[0]).params;

  return params[paramIndex] as string;
}

function extractEqBody(cond: unknown): string | undefined {
  const match = renderSql(cond).match(/"body" = \$(\d+)/);

  if (!match) {
    return undefined;
  }

  const paramIndex = Number(match[1]) - 1;
  const params = dialect.sqlToQuery(cond as Parameters<PgDialect["sqlToQuery"]>[0]).params;

  return params[paramIndex] as string;
}

function buildMockDb(): Record<string, unknown> {
  return {
    select: (_cols?: unknown) => ({
      from: () => ({
        where: (cond: unknown) => {
          const whereSql = renderSql(cond);

          if (
            !whereSql.includes(
              '("knowledge_bits"."tagged_at" is null and "knowledge_bits"."tag_failed_at" is null and "knowledge_bits"."approval_state" not in ($1, $2))',
            )
          ) {
            throw new Error(`unexpected where clause in test mock: ${whereSql}`);
          }

          const untagged = mockDbState.bits.filter(
            (row) => row.taggedAt === null && row.tagFailedAt === null,
          );

          return {
            orderBy: (order: unknown) => {
              const orderSql = renderSql(order);

              if (!orderSql.includes('"created_at" asc')) {
                throw new Error(`unexpected orderBy clause in test mock: ${orderSql}`);
              }

              const sorted = [...untagged].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return {
                limit: (n: number) =>
                  sorted.slice(0, n).map((row) => ({ id: row.id, body: row.body })),
              };
            },
          };
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<BitRow>) => ({
        where: (cond: unknown) => {
          const targetId = extractEqId(cond);
          const targetBody = extractEqBody(cond);
          const row = mockDbState.bits.find(
            (bit) => bit.id === targetId && bit.body === targetBody,
          );

          if (row) {
            Object.assign(row, patch);
          }

          return Promise.resolve();
        },
      }),
    }),
  };
}

function seedBit(overrides: Partial<BitRow> & { id: string }): BitRow {
  const full: BitRow = {
    body: "some bit text",
    taggedAt: null,
    tagFailedAt: null,
    createdAt: new Date(),
    ...overrides,
  };

  mockDbState.bits.push(full);

  return full;
}

function resetMockDbState(): void {
  mockDbState.bits = [];
}

vi.mock("../db/client.js", () => ({
  getDb: () => buildMockDb(),
}));

const {
  listKnowledgeBitsForTaggingScan,
  markKnowledgeBitTagged,
  markKnowledgeBitTagFailed,
} = await import("./knowledge-bit-tagging.repo.js");

beforeEach(() => {
  resetMockDbState();
});

describe("listKnowledgeBitsForTaggingScan", () => {
  it("returns only bits with no taggedAt and no tagFailedAt", async () => {
    seedBit({ id: "kb_1", body: "untagged", createdAt: new Date(2024, 0, 1) });
    seedBit({ id: "kb_2", body: "already tagged", taggedAt: new Date(2024, 0, 2) });
    seedBit({ id: "kb_3", body: "failed", tagFailedAt: new Date(2024, 0, 2) });

    const rows = await listKnowledgeBitsForTaggingScan(10);

    expect(rows).toEqual([{ id: "kb_1", body: "untagged" }]);
  });

  it("caps results at the given limit, oldest first", async () => {
    seedBit({ id: "kb_1", createdAt: new Date(2024, 0, 2) });
    seedBit({ id: "kb_2", createdAt: new Date(2024, 0, 1) });
    seedBit({ id: "kb_3", createdAt: new Date(2024, 0, 3) });

    const rows = await listKnowledgeBitsForTaggingScan(2);

    expect(rows.map((row) => row.id)).toEqual(["kb_2", "kb_1"]);
  });
});

describe("markKnowledgeBitTagged", () => {
  it("sets taggedAt", async () => {
    seedBit({ id: "kb_1", body: "some bit text" });

    await markKnowledgeBitTagged("kb_1", "some bit text");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row?.taggedAt).toBeInstanceOf(Date);
  });

  it("should leave taggedAt null when the body no longer matches what the scan read", async () => {
    seedBit({ id: "kb_1", body: "the new body after an edit" });

    await markKnowledgeBitTagged("kb_1", "the old body");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row?.taggedAt).toBeNull();
  });
});

describe("markKnowledgeBitTagFailed", () => {
  it("sets tagFailedAt", async () => {
    seedBit({ id: "kb_1", body: "some bit text" });

    await markKnowledgeBitTagFailed("kb_1", "some bit text");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row?.tagFailedAt).toBeInstanceOf(Date);
  });

  it("should leave tagFailedAt null when the body no longer matches what the scan read", async () => {
    seedBit({ id: "kb_1", body: "the new body after an edit" });

    await markKnowledgeBitTagFailed("kb_1", "the old body");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row?.tagFailedAt).toBeNull();
  });
});
