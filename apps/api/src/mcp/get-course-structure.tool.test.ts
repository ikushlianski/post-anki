import { describe, expect, it, vi } from "vitest";
import type { CourseOutline } from "../curriculum/curriculum-outline.repo.js";

const state = vi.hoisted(() => ({
  outline: null as CourseOutline | null,
}));

vi.mock("../curriculum/curriculum-outline.repo.js", () => ({
  getCourseOutline: vi.fn(async () => state.outline),
}));

const { getCourseStructure } = await import("./get-course-structure.tool.js");

describe("getCourseStructure", () => {
  it("returns the outline as-is when the curriculum exists", async () => {
    state.outline = {
      curriculum: { id: "cur_1", name: "Spanish 101", subjectId: "sub_1" },
      modules: [
        {
          id: "mod_1",
          title: "Module A",
          order: 0,
          topics: [{ id: "top_1", title: "Topic A1", order: 0, cardSetStatus: "ready" }],
        },
      ],
    };

    const result = await getCourseStructure({ curriculumId: "cur_1" });

    expect(result).toEqual(state.outline);
  });

  it("returns null for an unknown curriculum id", async () => {
    state.outline = null;

    const result = await getCourseStructure({ curriculumId: "cur_missing" });

    expect(result).toBeNull();
  });
});
