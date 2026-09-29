import { asc } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

interface CurriculumRow {
  id: string;
  name: string;
  subjectId: string;
}

interface ModuleRow {
  id: string;
  curriculumId: string;
  title: string;
  order: number;
}

interface TopicRow {
  id: string;
  moduleId: string;
  title: string;
  order: number;
}

interface CardSetRow {
  topicId: string;
  status: string;
}

const state = vi.hoisted(() => ({
  curriculumRows: [] as CurriculumRow[],
  moduleRows: [] as ModuleRow[],
  topicRows: [] as TopicRow[],
  cardSetRows: [] as CardSetRow[],
  orderByArgsByTable: new Map<string, unknown>(),
}));

vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  let currentTable: unknown;
  let currentTableName = "";

  function rowsForCurrentTable(): unknown[] {
    if (currentTable === schema.curricula) {
      return state.curriculumRows;
    }

    if (currentTable === schema.modules) {
      return state.moduleRows;
    }

    if (currentTable === schema.topics) {
      return state.topicRows;
    }

    if (currentTable === schema.topicCardSets) {
      return state.cardSetRows;
    }

    throw new Error("unexpected table in mock");
  }

  const tableNames = new Map<unknown, string>([
    [schema.curricula, "curricula"],
    [schema.modules, "modules"],
    [schema.topics, "topics"],
    [schema.topicCardSets, "topicCardSets"],
  ]);

  const chain = {
    select: () => chain,
    from: (table: unknown) => {
      currentTable = table;
      currentTableName = tableNames.get(table) ?? "";

      return chain;
    },
    where: () => {
      const rows = [...rowsForCurrentTable()];

      return Object.assign(rows, {
        orderBy: (arg: unknown) => {
          state.orderByArgsByTable.set(currentTableName, arg);

          return [...rowsForCurrentTable()];
        },
      });
    },
  };

  return { getDb: () => chain };
});

const { getCourseOutline } = await import("./curriculum-outline.repo.js");
const { modules, topics } = await import("../db/schema.js");

describe("getCourseOutline", () => {
  it("returns null for an unknown curriculum id", async () => {
    state.curriculumRows = [];

    const result = await getCourseOutline("cur_missing");

    expect(result).toBeNull();
  });

  it("orders modules and topics by their order column, and groups topics by module", async () => {
    state.curriculumRows = [{ id: "cur_1", name: "Spanish 101", subjectId: "sub_1" }];
    state.moduleRows = [
      { id: "mod_1", curriculumId: "cur_1", title: "Module A", order: 0 },
      { id: "mod_2", curriculumId: "cur_1", title: "Module B", order: 1 },
    ];
    state.topicRows = [
      { id: "top_1", moduleId: "mod_1", title: "Topic A1", order: 0 },
      { id: "top_2", moduleId: "mod_1", title: "Topic A2", order: 1 },
      { id: "top_3", moduleId: "mod_2", title: "Topic B1", order: 0 },
    ];
    state.cardSetRows = [];

    const result = await getCourseOutline("cur_1");

    expect(state.orderByArgsByTable.get("modules")).toEqual(asc(modules.order));
    expect(state.orderByArgsByTable.get("topics")).toEqual(asc(topics.order));
    expect(result?.curriculum).toEqual({ id: "cur_1", name: "Spanish 101", subjectId: "sub_1" });
    expect(result?.modules.map((m) => m.id)).toEqual(["mod_1", "mod_2"]);
    expect(result?.modules.find((m) => m.id === "mod_1")?.topics.map((t) => t.id)).toEqual([
      "top_1",
      "top_2",
    ]);
    expect(result?.modules.find((m) => m.id === "mod_2")?.topics.map((t) => t.id)).toEqual([
      "top_3",
    ]);
  });

  it("sets cardSetStatus from topic_card_sets, and null when no card set row exists", async () => {
    state.curriculumRows = [{ id: "cur_1", name: "Spanish 101", subjectId: "sub_1" }];
    state.moduleRows = [{ id: "mod_1", curriculumId: "cur_1", title: "Module A", order: 0 }];
    state.topicRows = [
      { id: "top_1", moduleId: "mod_1", title: "Topic A1", order: 0 },
      { id: "top_2", moduleId: "mod_1", title: "Topic A2", order: 1 },
    ];
    state.cardSetRows = [{ topicId: "top_1", status: "ready" }];

    const result = await getCourseOutline("cur_1");
    const resultTopics = result?.modules[0]?.topics ?? [];

    expect(resultTopics.find((t) => t.id === "top_1")?.cardSetStatus).toBe("ready");
    expect(resultTopics.find((t) => t.id === "top_2")?.cardSetStatus).toBeNull();
  });

  it("returns an empty modules array for a curriculum with no modules", async () => {
    state.curriculumRows = [{ id: "cur_1", name: "Empty course", subjectId: "sub_1" }];
    state.moduleRows = [];
    state.topicRows = [];
    state.cardSetRows = [];

    const result = await getCourseOutline("cur_1");

    expect(result?.modules).toEqual([]);
  });
});
