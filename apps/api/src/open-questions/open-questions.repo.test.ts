import { beforeEach, describe, expect, it, vi } from "vitest";

interface OpenQuestionRow {
  id: string;
  sourceType: string;
  sourceItemId: string;
  topicId: string | null;
  topicTitle: string | null;
  questionText: string;
  status: string;
  answerText: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

const table = new Map<string, OpenQuestionRow>();

const columnByDbName: Record<string, keyof OpenQuestionRow> = {
  id: "id",
  status: "status",
  source_type: "sourceType",
  source_item_id: "sourceItemId",
  topic_id: "topicId",
  topic_title: "topicTitle",
  question_text: "questionText",
  answer_text: "answerText",
  created_at: "createdAt",
  resolved_at: "resolvedAt",
};

function toPredicate(cond: unknown): (row: OpenQuestionRow) => boolean {
  const pairs: Array<[string, unknown]> = [];
  let pending: string | null = null;

  const walk = (node: unknown): void => {
    if (node == null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      return;
    }

    if (Array.isArray(node)) {
      return;
    }

    if (typeof node !== "object") {
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

  return (row) => pairs.every(([col, value]) => row[columnByDbName[col] ?? (col as keyof OpenQuestionRow)] === value);
}

function orderInfo(order: unknown): { column: keyof OpenQuestionRow; direction: "asc" | "desc" } {
  let columnName = "created_at";
  let direction: "asc" | "desc" = "asc";

  const walk = (node: unknown): void => {
    if (node == null || typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
      return;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }

      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const obj = node as Record<string, unknown>;

    if (typeof obj.name === "string") {
      columnName = obj.name;
      return;
    }

    if (Array.isArray(obj.value)) {
      if ((obj.value as unknown[]).map(String).join("").includes("desc")) {
        direction = "desc";
      }

      return;
    }

    if (Array.isArray(obj.queryChunks)) {
      for (const chunk of obj.queryChunks) {
        walk(chunk);
      }
    }
  };

  walk(order);

  return { column: columnByDbName[columnName] ?? "createdAt", direction };
}

type SelectResult = OpenQuestionRow[] | Array<{ value: number }>;

interface SelectBuilder {
  from: (table: unknown) => SelectBuilder;
  where: (cond: unknown) => SelectBuilder;
  orderBy: (order: unknown) => SelectBuilder;
  limit: (n: number) => SelectBuilder;
  then: (onFulfilled?: ((value: SelectResult) => void) | null) => void;
}

function makeSelect(columns?: unknown): SelectBuilder {
  const state: {
    predicate?: (row: OpenQuestionRow) => boolean;
    column: keyof OpenQuestionRow;
    direction: "asc" | "desc";
    limit?: number;
    isCount: boolean;
  } = { column: "createdAt", direction: "asc", isCount: false };

  if (columns !== undefined && columns !== null && typeof columns === "object" && "value" in columns) {
    state.isCount = true;
  }

  const evaluate = (): SelectResult => {
    const matching = [...table.values()].filter((row) => state.predicate?.(row) ?? true);

    if (state.isCount) {
      return [{ value: matching.length }];
    }

    const sorted = [...matching].sort((a, b) => {
      const aValue = a[state.column];
      const bValue = b[state.column];
      const diff = aValue instanceof Date && bValue instanceof Date ? aValue.getTime() - bValue.getTime() : 0;

      return state.direction === "desc" ? -diff : diff;
    });

    return state.limit === undefined ? sorted : sorted.slice(0, state.limit);
  };

  const builder: SelectBuilder = {
    from: () => builder,
    where: (cond) => {
      state.predicate = toPredicate(cond);
      return builder;
    },
    orderBy: (order) => {
      const info = orderInfo(order);
      state.column = info.column;
      state.direction = info.direction;
      return builder;
    },
    limit: (n) => {
      state.limit = n;
      return builder;
    },
    then: (onFulfilled) => {
      onFulfilled?.(evaluate());
    },
  };

  return builder;
}

const fakeDb = {
  select: (columns?: unknown) => makeSelect(columns),
  insert: (_table: unknown) => ({
    values: async (row: Record<string, unknown>) => {
      table.set(row.id as string, {
        ...(row as unknown as OpenQuestionRow),
        answerText: null,
        createdAt: new Date(),
        resolvedAt: null,
      });
    },
  }),
  update: (_table: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async (cond: unknown) => {
        const predicate = toPredicate(cond);

        for (const row of table.values()) {
          if (predicate(row)) {
            Object.assign(row, patch);
          }
        }
      },
    }),
  }),
};

vi.mock("../db/client.js", () => ({
  getDb: () => fakeDb,
}));

const { insertOpenQuestion, listOpenQuestions, countOpenQuestions, resolveOpenQuestion } =
  await import("./open-questions.repo.js");

function seed(row: Partial<OpenQuestionRow> & { id: string }): OpenQuestionRow {
  const full: OpenQuestionRow = {
    sourceType: "probe_question",
    sourceItemId: "pq_seed",
    topicId: null,
    topicTitle: null,
    questionText: "seeded question",
    status: "open",
    answerText: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    resolvedAt: null,
    ...row,
  };

  table.set(full.id, full);

  return full;
}

beforeEach(() => {
  table.clear();
});

describe("insertOpenQuestion", () => {
  it("creates a question in the open state with the caller's source and topic, answer and resolution empty", async () => {
    const created = await insertOpenQuestion({
      sourceType: "probe_question",
      sourceItemId: "pq_1",
      topicId: "t1",
      topicTitle: "Async iterators",
      questionText: "Why does for-await matter?",
    });

    expect(created).toMatchObject({
      sourceType: "probe_question",
      sourceItemId: "pq_1",
      topicId: "t1",
      topicTitle: "Async iterators",
      questionText: "Why does for-await matter?",
      status: "open",
      answerText: null,
      resolvedAt: null,
    });
    expect(created.id).toMatch(/^oq_/);
    expect(Number.isNaN(Date.parse(created.createdAt))).toBe(false);
  });
});

describe("listOpenQuestions", () => {
  it("returns questions oldest-first so the longest-unanswered question surfaces first", async () => {
    seed({
      id: "oq_newer",
      questionText: "newer",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    seed({
      id: "oq_older",
      questionText: "older",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const items = await listOpenQuestions();

    expect(items.map((item) => item.id)).toEqual(["oq_older", "oq_newer"]);
  });

  it("filters to only the requested status", async () => {
    seed({ id: "oq_open", status: "open", questionText: "still open" });
    seed({ id: "oq_answered", status: "answered", questionText: "already answered" });

    const open = await listOpenQuestions("open");
    const answered = await listOpenQuestions("answered");

    expect(open.map((item) => item.id)).toEqual(["oq_open"]);
    expect(answered.map((item) => item.id)).toEqual(["oq_answered"]);
  });

  it("caps the returned rows at the requested limit", async () => {
    seed({ id: "oq_1", createdAt: new Date("2026-01-01T00:00:00.000Z") });
    seed({ id: "oq_2", createdAt: new Date("2026-01-02T00:00:00.000Z") });
    seed({ id: "oq_3", createdAt: new Date("2026-01-03T00:00:00.000Z") });

    const items = await listOpenQuestions(undefined, 2);

    expect(items.map((item) => item.id)).toEqual(["oq_1", "oq_2"]);
  });

  it("serializes createdAt and resolvedAt to ISO strings", async () => {
    seed({
      id: "oq_answered",
      status: "answered",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      resolvedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const items = await listOpenQuestions("answered");

    expect(items[0]?.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(items[0]?.resolvedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});

describe("countOpenQuestions", () => {
  it("counts every question when no status is given", async () => {
    seed({ id: "oq_open", status: "open" });
    seed({ id: "oq_answered", status: "answered" });

    expect(await countOpenQuestions()).toBe(2);
  });

  it("counts only the requested status", async () => {
    seed({ id: "oq_open", status: "open" });
    seed({ id: "oq_answered", status: "answered" });

    expect(await countOpenQuestions("open")).toBe(1);
    expect(await countOpenQuestions("answered")).toBe(1);
    expect(await countOpenQuestions("dismissed")).toBe(0);
  });
});

describe("resolveOpenQuestion", () => {
  it("records the answer, a resolvedAt timestamp, and flips the status to answered", async () => {
    seed({ id: "oq_1", status: "open", questionText: "Why?" });

    const resolved = await resolveOpenQuestion("oq_1", "answered", "Because of X");

    expect(resolved).toMatchObject({
      id: "oq_1",
      status: "answered",
      answerText: "Because of X",
    });
    expect(resolved?.resolvedAt).not.toBeNull();

    const stillOpen = await listOpenQuestions("open");
    expect(stillOpen.map((item) => item.id)).not.toContain("oq_1");
  });

  it("drops any answer text when the question is dismissed", async () => {
    seed({ id: "oq_1", status: "open", questionText: "Why?" });

    const resolved = await resolveOpenQuestion("oq_1", "dismissed", "ignored answer");

    expect(resolved).toMatchObject({ id: "oq_1", status: "dismissed", answerText: null });
  });

  it("returns null for an id that does not exist", async () => {
    expect(await resolveOpenQuestion("oq_missing", "answered", "Because")).toBeNull();
  });

  it("returns null when the question was already resolved, leaving the first answer intact", async () => {
    seed({ id: "oq_1", status: "open", questionText: "Why?" });

    const first = await resolveOpenQuestion("oq_1", "answered", "First answer");
    const second = await resolveOpenQuestion("oq_1", "answered", "Second answer");

    expect(first?.answerText).toBe("First answer");
    expect(second).toBeNull();
    expect(table.get("oq_1")?.answerText).toBe("First answer");
  });
});
