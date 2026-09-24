export interface SourceRow {
  id: string;
  status: string;
  rawText: string | null;
  failureReason: string | null;
  updatedAt: Date;
}

interface BitRow {
  id: string;
  knowledgeSourceId: string;
  ordinal: number;
  body: string;
}

export const mockDbState = {
  sources: new Map<string, SourceRow>(),
  bits: [] as BitRow[],
  // Set to a source id to simulate a concurrent caller claiming that row in
  // between this call's own select and its per-row update.
  raceStealAfterSelectId: null as string | null,
};

const columnByDbName: Record<string, string> = {
  id: "id",
  status: "status",
  knowledge_source_id: "knowledgeSourceId",
  ordinal: "ordinal",
  updated_at: "updatedAt",
};

type Op = "eq" | "lt";

function toPredicate(cond: unknown): (row: Record<string, unknown>) => boolean {
  const pairs: Array<[string, unknown, Op]> = [];
  let pending: string | null = null;
  let pendingOp: Op = "eq";

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

    if (
      Array.isArray(obj.value) &&
      obj.value.length > 0 &&
      typeof obj.value[0] === "string"
    ) {
      const opText = obj.value[0] as string;

      if (opText.includes("<")) {
        pendingOp = "lt";
      } else if (opText.includes("=")) {
        pendingOp = "eq";
      }

      return;
    }

    if (typeof obj.name === "string") {
      pending = obj.name;
      pendingOp = "eq";
      return;
    }

    if ("value" in obj && !Array.isArray(obj.value)) {
      if (pending !== null) {
        pairs.push([pending, obj.value, pendingOp]);
        pending = null;
        pendingOp = "eq";
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

  const timeOf = (value: unknown): unknown => (value instanceof Date ? value.getTime() : value);

  return (row) =>
    pairs.every(([col, value, op]) => {
      const rowValue = row[columnByDbName[col] ?? col];

      if (op === "lt") {
        return (timeOf(rowValue) as number) < (timeOf(value) as number);
      }

      return timeOf(rowValue) === timeOf(value);
    });
}

export function buildMockDb(): Record<string, unknown> {
  return {
    select: (_cols?: unknown) => ({
      from: () => ({
        where: (cond: unknown) => {
          const predicate = toPredicate(cond);
          let limitN: number | undefined;

          const evaluate = () =>
            [...mockDbState.sources.values()]
              .filter((row) => predicate(row as unknown as Record<string, unknown>))
              .map((row) => ({ id: row.id }))
              .slice(0, limitN);

          return {
            limit: (n: number) => {
              limitN = n;

              const results = evaluate();
              const stolenId = mockDbState.raceStealAfterSelectId;

              if (stolenId) {
                const stolenRow = mockDbState.sources.get(stolenId);

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
            const exists = mockDbState.bits.some(
              (bit) =>
                bit.knowledgeSourceId === row.knowledgeSourceId && bit.ordinal === row.ordinal,
            );

            if (!exists) {
              mockDbState.bits.push(row);
            }
          }
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<SourceRow>) => ({
        where: (cond: unknown) => {
          const predicate = toPredicate(cond);

          const matches = [...mockDbState.sources.values()].filter((row) =>
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

export function seedSource(overrides: Partial<SourceRow> & { id: string }): SourceRow {
  const full: SourceRow = {
    status: "pending",
    rawText: "some prose",
    failureReason: null,
    updatedAt: new Date(),
    ...overrides,
  };

  mockDbState.sources.set(full.id, full);

  return full;
}

export function resetMockDbState(): void {
  mockDbState.sources.clear();
  mockDbState.bits = [];
  mockDbState.raceStealAfterSelectId = null;
}
