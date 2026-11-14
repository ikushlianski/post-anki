import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../subject/subject.repo.js", () => ({ listSubjects: vi.fn() }));

const { listSubjects } = await import("../subject/subject.repo.js");
const { listSubjectTree } = await import("./list-subjects.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("listSubjectTree", () => {
  it("should list sub-subjects right after their parent with a full path", async () => {
    vi.mocked(listSubjects).mockResolvedValue([
      { id: "s2", name: "Words", parentId: "s1", cardCount: 3 },
      { id: "s3", name: "Math", parentId: null },
      { id: "s1", name: "English", parentId: null, cardCount: 5 },
    ] as never);

    const { subjects } = await listSubjectTree();

    expect(subjects.map((s) => [s.id, s.path, s.depth])).toEqual([
      ["s1", "English", 0],
      ["s2", "English/Words", 1],
      ["s3", "Math", 0],
    ]);
    expect(subjects[2]?.cardCount).toBeNull();
  });
});
