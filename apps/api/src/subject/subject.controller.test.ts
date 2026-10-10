import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subject } from "@post-anki/shared";

vi.mock("./subject.repo.js", () => ({
  createSubject: vi.fn(),
  deleteSubject: vi.fn(),
  listSubjects: vi.fn(),
  mergeSubjects: vi.fn(),
  searchSubjectsByText: vi.fn(),
  updateSubject: vi.fn(),
}));

const { listSubjects, searchSubjectsByText } = await import("./subject.repo.js");
const { handleListSubjects } = await import("./subject.controller.js");

const linearAlgebra: Subject = {
  id: "sub_1",
  name: "Linear Algebra",
  description: undefined,
  requireSources: false,
  kind: "architecture-mentor",
  modelTier: null,
  parentId: null,
};

function fakeRes(): http.ServerResponse & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    writeHead(status: number) {
      res.statusCode = status;

      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { statusCode: number; body: unknown };
}

describe("handleListSubjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should list every subject when no query parameter is given", async () => {
    vi.mocked(listSubjects).mockResolvedValue([linearAlgebra]);
    const res = fakeRes();

    await handleListSubjects(res, null);

    expect(searchSubjectsByText).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([linearAlgebra]);
  });

  it("should search by the query with surrounding whitespace trimmed", async () => {
    vi.mocked(searchSubjectsByText).mockResolvedValue([linearAlgebra]);
    const res = fakeRes();

    await handleListSubjects(res, "  Linear  ");

    expect(searchSubjectsByText).toHaveBeenCalledWith("Linear");
    expect(listSubjects).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([linearAlgebra]);
  });

  it("should accept a query of exactly 100 characters", async () => {
    vi.mocked(searchSubjectsByText).mockResolvedValue([]);
    const query = "a".repeat(100);
    const res = fakeRes();

    await handleListSubjects(res, query);

    expect(searchSubjectsByText).toHaveBeenCalledWith(query);
    expect(res.statusCode).toBe(200);
  });

  it("should reject a blank query with a 400 and not run the search", async () => {
    const res = fakeRes();

    await handleListSubjects(res, "   ");

    expect(searchSubjectsByText).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_input" });
  });

  it("should reject a query longer than 100 characters with a 400", async () => {
    const res = fakeRes();

    await handleListSubjects(res, "a".repeat(101));

    expect(searchSubjectsByText).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_input" });
  });
});
