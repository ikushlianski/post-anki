import { beforeEach, describe, expect, it, vi } from "vitest";

interface SourceRow {
  id: string;
  status: string;
  rawText: string | null;
  failureReason: string | null;
}

interface BitRow {
  id: string;
  knowledgeSourceId: string;
  ordinal: number;
  body: string;
}

const state = vi.hoisted(() => ({
  sources: new Map<string, SourceRow>(),
  bits: [] as BitRow[],
  // Set to a source id to simulate a concurrent caller claiming that row in
  // between this call's own select and its per-row update.
  raceStealAfterSelectId: null as string | null,
}));

const columnByDbName: Record<string, string> = {
  id: "id",
  status: "status",
  knowledge_source_id: "knowledgeSourceId",
  ordinal: "ordinal",
};

function toPredicate(cond: unknown): (row: Record<string, unknown>) => boolean {
  const pairs: Array<[string, unknown]> = [];
  let pending: string | null = null;

  const walk = (node: unknown): void => {
    if (node == null || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }

      return;
    }

    const obj = node as Record<string, unknown>;

    if (typeof obj.name === "string") {
      pending = obj.name;
      return;
    }

    if ("value" in obj && !Array.isArray(obj.value)) {
      if (pending !== null) {
        pairs.push([pending, obj.value]);
        pending = null;
      }

      return;
    }

    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks) {
        walk(chunk);
      }
    }
  };

  walk(cond);

  return (row) => pairs.every(([col, value]) => row[columnByDbName[col] ?? col] === value);
}

function buildMockDb(): Record<string, unknown> {
  return {
    select: (_cols?: unknown) => ({
      from: () => ({
        where: (cond: unknown) => {
          const predicate = toPredicate(cond);
          let limitN: number | undefined;

          const evaluate = () =>
            [...state.sources.values()]
              .filter((row) => predicate(row as unknown as Record<string, unknown>))
              .map((row) => ({ id: row.id }))
              .slice(0, limitN);

          return {
            limit: (n: number) => {
              limitN = n;

              const results = evaluate();
              const stolenId = state.raceStealAfterSelectId;

              if (stolenId) {
                const stolenRow = state.sources.get(stolenId);

                if (stolenRow) {
                  stolenRow.status = "processing";
                }
              }

              return results;
            },
          };
        },
      }),
    }),
    insert: () => ({
      values: (rows: BitRow[]) => ({
        onConflictDoNothing: async (_opts: unknown) => {
          for (const row of rows) {
            const exists = state.bits.some(
              (bit) =>
                bit.knowledgeSourceId === row.knowledgeSourceId && bit.ordinal === row.ordinal,
            );

            if (!exists) {
              state.bits.push(row);
            }
          }
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<SourceRow>) => ({
        where: (cond: unknown) => {
          const predicate = toPredicate(cond);

          const matches = [...state.sources.values()].filter((row) =>
            predicate(row as unknown as Record<string, unknown>),
          );

          for (const row of matches) {
            Object.assign(row, patch);
          }

          return {
            returning: async (_cols: unknown) =>
              matches.map((row) => ({ id: row.id, rawText: row.rawText })),
            then: (onFulfilled?: ((value: unknown) => void) | null) => {
              onFulfilled?.(undefined);
            },
          };
        },
      }),
    }),
    transaction: async (cb: (tx: Record<string, unknown>) => Promise<void>) => cb(buildMockDb()),
  };
}

vi.mock("../db/client.js", () => ({
  getDb: () => buildMockDb(),
}));

const {
  insertKnowledgeBits,
  claimPendingKnowledgeSources,
  markKnowledgeSourceFailed,
  markKnowledgeSourceBitsDetected,
  insertKnowledgeBitsAndMarkDetected,
} = await import("./knowledge-bit.repo.js");

function seedSource(overrides: Partial<SourceRow> & { id: string }): SourceRow {
  const full: SourceRow = {
    status: "pending",
    rawText: "some prose",
    failureReason: null,
    ...overrides,
  };

  state.sources.set(full.id, full);

  return full;
}

beforeEach(() => {
  state.sources.clear();
  state.bits = [];
  state.raceStealAfterSelectId = null;
});

describe("insertKnowledgeBits", () => {
  it("inserts one row per bit, ordinal matching the array index", async () => {
    await insertKnowledgeBits("ks_1", ["First bit.", "Second bit.", "Third bit."]);

    expect(state.bits).toEqual([
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 0, body: "First bit." },
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 1, body: "Second bit." },
      { id: expect.stringMatching(/^kb_/), knowledgeSourceId: "ks_1", ordinal: 2, body: "Third bit." },
    ]);
  });

  it("skips a bit whose (sourceId, ordinal) already exists instead of duplicating it", async () => {
    await insertKnowledgeBits("ks_1", ["First bit.", "Second bit."]);
    await insertKnowledgeBits("ks_1", ["First bit re-detected.", "Second bit re-detected."]);

    expect(state.bits).toHaveLength(2);
    expect(state.bits.map((bit) => bit.body)).toEqual(["First bit.", "Second bit."]);
  });
});

describe("claimPendingKnowledgeSources", () => {
  it("claims up to the given limit of pending sources, flipping them to processing", async () => {
    seedSource({ id: "ks_1", rawText: "text one" });
    seedSource({ id: "ks_2", rawText: "text two" });
    seedSource({ id: "ks_3", status: "bits_detected" });

    const claimed = await claimPendingKnowledgeSources(10);

    expect(claimed).toEqual(
      expect.arrayContaining([
        { id: "ks_1", rawText: "text one" },
        { id: "ks_2", rawText: "text two" },
      ]),
    );
    expect(claimed).toHaveLength(2);
    expect(state.sources.get("ks_1")?.status).toBe("processing");
    expect(state.sources.get("ks_2")?.status).toBe("processing");
    expect(state.sources.get("ks_3")?.status).toBe("bits_detected");
  });

  it("excludes a source that lost the race to a concurrent claim instead of erroring", async () => {
    seedSource({ id: "ks_1", rawText: "text one" });
    seedSource({ id: "ks_2", rawText: "text two" });
    state.raceStealAfterSelectId = "ks_1";

    const claimed = await claimPendingKnowledgeSources(10);

    expect(claimed).toEqual([{ id: "ks_2", rawText: "text two" }]);
    expect(state.sources.get("ks_1")?.status).toBe("processing");
  });
});

describe("markKnowledgeSourceFailed", () => {
  it("sets status to failed with the given reason", async () => {
    seedSource({ id: "ks_1", status: "processing" });

    await markKnowledgeSourceFailed("ks_1", "source_too_long");

    expect(state.sources.get("ks_1")).toMatchObject({
      status: "failed",
      failureReason: "source_too_long",
    });
  });

  it("does nothing to a source that isn't currently processing", async () => {
    seedSource({ id: "ks_1", status: "bits_detected" });

    await markKnowledgeSourceFailed("ks_1", "source_too_long");

    expect(state.sources.get("ks_1")?.status).toBe("bits_detected");
    expect(state.sources.get("ks_1")?.failureReason).toBeNull();
  });
});

describe("markKnowledgeSourceBitsDetected", () => {
  it("sets status to bits_detected and clears any prior failure reason", async () => {
    seedSource({ id: "ks_1", status: "processing", failureReason: "source_too_long" });

    await markKnowledgeSourceBitsDetected("ks_1");

    expect(state.sources.get("ks_1")).toMatchObject({
      status: "bits_detected",
      failureReason: null,
    });
  });

  it("does nothing to a source that isn't currently processing", async () => {
    seedSource({ id: "ks_1", status: "failed", failureReason: "source_too_long" });

    await markKnowledgeSourceBitsDetected("ks_1");

    expect(state.sources.get("ks_1")).toMatchObject({
      status: "failed",
      failureReason: "source_too_long",
    });
  });
});

describe("insertKnowledgeBitsAndMarkDetected", () => {
  it("inserts the bits and marks the source detected together", async () => {
    seedSource({ id: "ks_1", status: "processing" });

    await insertKnowledgeBitsAndMarkDetected("ks_1", ["First bit.", "Second bit."]);

    expect(state.bits).toHaveLength(2);
    expect(state.sources.get("ks_1")?.status).toBe("bits_detected");
  });
});
