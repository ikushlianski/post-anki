import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createModule = vi.hoisted(() => vi.fn());
const deleteModule = vi.hoisted(() => vi.fn());
const reorderModules = vi.hoisted(() => vi.fn());
const updateModule = vi.hoisted(() => vi.fn());

vi.mock("./module.repo.js", () => ({ createModule, deleteModule, reorderModules, updateModule }));

import {
  handleCreateModule,
  handleDeleteModule,
  handleReorderModules,
  handleUpdateModule,
} from "./module.controller.js";

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() };

  return res as unknown as http.ServerResponse & typeof res;
}

function sent(res: ReturnType<typeof fakeRes>): { status: number; body: Record<string, unknown> } {
  return {
    status: vi.mocked(res.writeHead).mock.calls[0]![0] as number,
    body: JSON.parse(vi.mocked(res.end).mock.calls[0]![0] as string),
  };
}

beforeEach(() => {
  createModule.mockReset();
  deleteModule.mockReset();
  reorderModules.mockReset();
  updateModule.mockReset();
});

describe("handleCreateModule", () => {
  it("should answer 400 and create nothing when the title is empty", async () => {
    const res = fakeRes();

    await handleCreateModule(fakeReq({ title: "" }), res, "c1");

    expect(sent(res).status).toBe(400);
    expect(createModule).not.toHaveBeenCalled();
  });

  it("should create the module inside the curriculum from the URL and answer 201", async () => {
    createModule.mockResolvedValue({ id: "m1", title: "Basics" });
    const res = fakeRes();

    await handleCreateModule(fakeReq({ title: "Basics" }), res, "c1");

    expect(createModule).toHaveBeenCalledWith({ title: "Basics", curriculumId: "c1" });
    expect(sent(res)).toEqual({ status: 201, body: { id: "m1", title: "Basics" } });
  });
});

describe("handleUpdateModule", () => {
  it("should answer 400 for an invalid body", async () => {
    const res = fakeRes();

    await handleUpdateModule(fakeReq({ order: "first" }), res, "m1");

    expect(sent(res).status).toBe(400);
    expect(updateModule).not.toHaveBeenCalled();
  });

  it("should answer 404 for an unknown module", async () => {
    updateModule.mockResolvedValue(null);
    const res = fakeRes();

    await handleUpdateModule(fakeReq({ title: "New" }), res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("should update using the module id from the URL and answer 200", async () => {
    updateModule.mockResolvedValue({ id: "m1", title: "New" });
    const res = fakeRes();

    await handleUpdateModule(fakeReq({ title: "New" }), res, "m1");

    expect(updateModule).toHaveBeenCalledWith({ title: "New", moduleId: "m1" });
    expect(sent(res).status).toBe(200);
  });
});

describe("handleDeleteModule", () => {
  it("should answer 404 for an unknown module", async () => {
    deleteModule.mockResolvedValue(false);
    const res = fakeRes();

    await handleDeleteModule(res, "nope");

    expect(sent(res)).toEqual({ status: 404, body: { error: "not_found" } });
  });

  it("should confirm the deletion", async () => {
    deleteModule.mockResolvedValue(true);
    const res = fakeRes();

    await handleDeleteModule(res, "m1");

    expect(sent(res)).toEqual({ status: 200, body: { id: "m1", deleted: true } });
  });
});

describe("handleReorderModules", () => {
  it("should answer 400 when the ordered list is empty", async () => {
    const res = fakeRes();

    await handleReorderModules(fakeReq({ orderedIds: [] }), res, "c1");

    expect(sent(res).status).toBe(400);
    expect(reorderModules).not.toHaveBeenCalled();
  });

  it("should pass the repo's error through as 400", async () => {
    reorderModules.mockResolvedValue({ error: "ids_mismatch" });
    const res = fakeRes();

    await handleReorderModules(fakeReq({ orderedIds: ["m1"] }), res, "c1");

    expect(sent(res)).toEqual({ status: 400, body: { error: "ids_mismatch" } });
  });

  it("should reorder within the curriculum and answer 200", async () => {
    reorderModules.mockResolvedValue([{ id: "m2" }, { id: "m1" }]);
    const res = fakeRes();

    await handleReorderModules(fakeReq({ orderedIds: ["m2", "m1"] }), res, "c1");

    expect(reorderModules).toHaveBeenCalledWith("c1", ["m2", "m1"]);
    expect(sent(res).status).toBe(200);
  });
});
