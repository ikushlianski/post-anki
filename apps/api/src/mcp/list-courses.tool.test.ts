import { describe, expect, it, vi } from "vitest";
import type { Curriculum } from "@post-anki/shared";

const state = vi.hoisted(() => ({
  courses: [] as Curriculum[],
  subjectNamesById: new Map<string, string>(),
  lastSubjectIdFilter: undefined as string | undefined,
  lastRequestedSubjectIds: [] as string[],
}));

vi.mock("../curriculum/curriculum.repo.js", () => ({
  listCurricula: vi.fn(async (subjectId?: string) => {
    state.lastSubjectIdFilter = subjectId;

    return subjectId ? state.courses.filter((c) => c.subjectId === subjectId) : state.courses;
  }),
}));

vi.mock("../subject/subject.repo.js", () => ({
  getSubjectNamesByIds: vi.fn(async (ids: string[]) => {
    state.lastRequestedSubjectIds = ids;

    return new Map(
      ids.filter((id) => state.subjectNamesById.has(id)).map((id) => [id, state.subjectNamesById.get(id)!]),
    );
  }),
}));

const { listCourses, LIST_COURSES_MAX_LIMIT } = await import("./list-courses.tool.js");

function makeCurriculum(overrides: Partial<Curriculum> = {}): Curriculum {
  return {
    id: "cur_1",
    subjectId: "sub_1",
    name: "Course 1",
    description: undefined,
    status: "curating",
    learningStatus: "not_started",
    speed: "normal",
    hinting: true,
    defaultDepth: "working",
    origin: "sources",
    strictOrder: false,
    preAssessmentCompletedAt: null,
    domainNodeId: null,
    order: 0,
    modelTier: null,
    categoryId: null,
    ...overrides,
  };
}

describe("listCourses", () => {
  it("maps each course to its id/name/subjectId/subjectName", async () => {
    state.courses = [makeCurriculum({ id: "cur_1", subjectId: "sub_1", name: "Spanish 101" })];
    state.subjectNamesById = new Map([["sub_1", "Spanish"]]);

    const result = await listCourses({});

    expect(result.items).toEqual([
      { id: "cur_1", name: "Spanish 101", subjectId: "sub_1", subjectName: "Spanish" },
    ]);
    expect(result.total).toBe(1);
  });

  it("maps a course whose subject no longer exists to a null subjectName", async () => {
    state.courses = [makeCurriculum({ id: "cur_1", subjectId: "sub_gone" })];
    state.subjectNamesById = new Map();

    const result = await listCourses({});

    expect(result.items[0]?.subjectName).toBeNull();
  });

  it("passes subjectId through to the repo filter", async () => {
    state.courses = [makeCurriculum({ id: "cur_1", subjectId: "sub_1" })];
    state.subjectNamesById = new Map([["sub_1", "Spanish"]]);

    await listCourses({ subjectId: "sub_1" });

    expect(state.lastSubjectIdFilter).toBe("sub_1");
  });

  it("only requests subject names for the returned page, not every course", async () => {
    state.courses = Array.from({ length: 5 }, (_, i) =>
      makeCurriculum({ id: `cur_${i}`, subjectId: `sub_${i}`, name: `Course ${i}` }),
    );
    state.subjectNamesById = new Map(state.courses.map((c) => [c.subjectId, `Subject ${c.subjectId}`]));

    await listCourses({ limit: 2, offset: 0 });

    expect(state.lastRequestedSubjectIds.sort()).toEqual(["sub_0", "sub_1"]);
  });

  it("defaults to limit 50 and offset 0", async () => {
    state.courses = [makeCurriculum()];
    state.subjectNamesById = new Map([["sub_1", "Spanish"]]);

    const result = await listCourses({});

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("clamps a limit above 200 to 200", async () => {
    state.courses = Array.from({ length: 3 }, (_, i) => makeCurriculum({ id: `cur_${i}` }));
    state.subjectNamesById = new Map([["sub_1", "Spanish"]]);

    const result = await listCourses({ limit: 5000 });

    expect(result.limit).toBe(LIST_COURSES_MAX_LIMIT);
    expect(result.items).toHaveLength(3);
  });

  it("honours limit and offset for paging, with a correct total", async () => {
    state.courses = Array.from({ length: 10 }, (_, i) =>
      makeCurriculum({ id: `cur_${i}`, subjectId: "sub_1" }),
    );
    state.subjectNamesById = new Map([["sub_1", "Spanish"]]);

    const result = await listCourses({ limit: 3, offset: 4 });

    expect(result.items.map((item) => item.id)).toEqual(["cur_4", "cur_5", "cur_6"]);
    expect(result.total).toBe(10);
  });
});
