import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface BitRow {
  id: string;
  body: string;
  embeddingHash: string | null;
  embeddedAt: Date | null;
  createdAt: Date;
  embedding: number[] | null;
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

          if (!whereSql.includes('"embedded_at" is null')) {
            throw new Error(`unexpected where clause in test mock: ${whereSql}`);
          }

          const unembedded = mockDbState.bits.filter((row) => row.embeddedAt === null);

          return {
            orderBy: (order: unknown) => {
              const orderSql = renderSql(order);

              if (!orderSql.includes('"created_at" asc')) {
                throw new Error(`unexpected orderBy clause in test mock: ${orderSql}`);
              }

              const sorted = [...unembedded].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
              );

              return {
                limit: (n: number) =>
                  sorted
                    .slice(0, n)
                    .map((row) => ({ id: row.id, body: row.body, embeddingHash: row.embeddingHash })),
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
    embeddingHash: null,
    embeddedAt: null,
    createdAt: new Date(),
    embedding: null,
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

const { listKnowledgeBitsForEmbeddingScan, updateKnowledgeBitEmbedding } = await import(
  "./knowledge-bit-embedding.repo.js"
);

beforeEach(() => {
  resetMockDbState();
});

describe("listKnowledgeBitsForEmbeddingScan", () => {
  it("returns only bits with no embeddedAt yet", async () => {
    seedBit({ id: "kb_1", body: "unembedded", createdAt: new Date(2024, 0, 1) });
    seedBit({ id: "kb_2", body: "already embedded", embeddedAt: new Date(2024, 0, 2) });

    const rows = await listKnowledgeBitsForEmbeddingScan(10);

    expect(rows).toEqual([{ id: "kb_1", body: "unembedded", embeddingHash: null }]);
  });

  it("caps results at the given limit, oldest first", async () => {
    seedBit({ id: "kb_1", createdAt: new Date(2024, 0, 2) });
    seedBit({ id: "kb_2", createdAt: new Date(2024, 0, 1) });
    seedBit({ id: "kb_3", createdAt: new Date(2024, 0, 3) });

    const rows = await listKnowledgeBitsForEmbeddingScan(2);

    expect(rows.map((row) => row.id)).toEqual(["kb_2", "kb_1"]);
  });
});

describe("updateKnowledgeBitEmbedding", () => {
  it("writes the embedding, hash, and embeddedAt together", async () => {
    seedBit({ id: "kb_1", body: "some bit text" });

    await updateKnowledgeBitEmbedding("kb_1", [0.1, 0.2, 0.3], "hash_abc", "some bit text");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row).toMatchObject({
      embedding: [0.1, 0.2, 0.3],
      embeddingHash: "hash_abc",
    });
    expect(row?.embeddedAt).toBeInstanceOf(Date);
  });

  it("should leave embeddedAt null when the body no longer matches what the scan read", async () => {
    seedBit({ id: "kb_1", body: "the new body after an edit" });

    await updateKnowledgeBitEmbedding("kb_1", [0.1, 0.2, 0.3], "hash_abc", "the old body");

    const row = mockDbState.bits.find((bit) => bit.id === "kb_1");

    expect(row?.embeddedAt).toBeNull();
    expect(row?.embedding).toBeNull();
    expect(row?.embeddingHash).toBeNull();
  });
});
