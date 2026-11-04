import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const insertCategory = vi.fn();
const moveCategory = vi.fn();
const renameCategory = vi.fn();

vi.mock("./subject-category.repo.js", () => ({
  insertCategory: (...args: unknown[]) => insertCategory(...args),
  moveCategory: (...args: unknown[]) => moveCategory(...args),
  renameCategory: (...args: unknown[]) => renameCategory(...args),
  listAllCategories: vi.fn(),
  listCategoriesForSubject: vi.fn(),
}));

const { handleCreateSubjectCategory, handleMoveCategory, handleRenameCategory } = await import(
  "./subject-category.controller.js"
);

const category = { id: "c1", name: "Math" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleCreateSubjectCategory", () => {
  it("should answer 400 and create nothing when the name is blank", async () => {
    const res = fakeRes();

    await handleCreateSubjectCategory(fakeReq(JSON.stringify({ name: "   " })), res, "s1");

    expect(res.status).toBe(400);
    expect(insertCategory).not.toHaveBeenCalled();
  });

  it("should answer 404 when the subject does not exist", async () => {
    insertCategory.mockResolvedValue({ error: "subject_not_found" });
    const res = fakeRes();

    await handleCreateSubjectCategory(fakeReq(JSON.stringify({ name: "Math" })), res, "nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "subject_not_found" });
  });

  it("should answer 400 when the parent belongs to another subject", async () => {
    insertCategory.mockResolvedValue({ error: "parent_wrong_subject" });
    const res = fakeRes();

    await handleCreateSubjectCategory(fakeReq(JSON.stringify({ name: "Math", parentId: "p" })), res, "s1");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "parent_wrong_subject" });
  });

  it("should answer 201 with the category and take the subject from the path", async () => {
    insertCategory.mockResolvedValue(category);
    const res = fakeRes();

    await handleCreateSubjectCategory(fakeReq(JSON.stringify({ name: " Math ", subjectId: "evil" })), res, "s1");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(category);
    expect(insertCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Math", subjectId: "s1" }));
  });
});

describe("handleMoveCategory", () => {
  it("should answer 400 when parentId is missing", async () => {
    const res = fakeRes();

    await handleMoveCategory(fakeReq(JSON.stringify({})), res, "c1");

    expect(res.status).toBe(400);
    expect(moveCategory).not.toHaveBeenCalled();
  });

  it.each(["category_not_found", "parent_not_found"])("should answer 404 on %s", async (error) => {
    moveCategory.mockResolvedValue({ error });
    const res = fakeRes();

    await handleMoveCategory(fakeReq(JSON.stringify({ parentId: "p" })), res, "c1");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error });
  });

  it.each(["parent_wrong_subject", "would_create_cycle"])("should answer 400 when the move is rejected with %s", async (error) => {
    moveCategory.mockResolvedValue({ error });
    const res = fakeRes();

    await handleMoveCategory(fakeReq(JSON.stringify({ parentId: "p" })), res, "c1");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error });
  });

  it("should answer 200 and allow moving to the top level with a null parent", async () => {
    moveCategory.mockResolvedValue(category);
    const res = fakeRes();

    await handleMoveCategory(fakeReq(JSON.stringify({ parentId: null })), res, "c1");

    expect(res.status).toBe(200);
    expect(moveCategory).toHaveBeenCalledWith("c1", null);
  });
});

describe("handleRenameCategory", () => {
  it("should answer 400 when the new name is empty", async () => {
    const res = fakeRes();

    await handleRenameCategory(fakeReq(JSON.stringify({ name: "" })), res, "c1");

    expect(res.status).toBe(400);
    expect(renameCategory).not.toHaveBeenCalled();
  });

  it("should answer 404 when the category does not exist", async () => {
    renameCategory.mockResolvedValue({ error: "category_not_found" });
    const res = fakeRes();

    await handleRenameCategory(fakeReq(JSON.stringify({ name: "New" })), res, "c1");

    expect(res.status).toBe(404);
  });

  it("should answer 200 with the renamed category", async () => {
    renameCategory.mockResolvedValue({ id: "c1", name: "New" });
    const res = fakeRes();

    await handleRenameCategory(fakeReq(JSON.stringify({ name: " New " })), res, "c1");

    expect(res.status).toBe(200);
    expect(renameCategory).toHaveBeenCalledWith("c1", "New");
  });
});
