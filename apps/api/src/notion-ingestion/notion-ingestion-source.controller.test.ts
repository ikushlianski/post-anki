import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotionIngestionSource } from "@post-anki/shared";
import { fakeReq, fakeRes } from "./test-mocks/fake-http.js";

vi.mock("./notion-ingestion-source.repo.js", () => ({
  createNotionSource: vi.fn(),
  deleteNotionSource: vi.fn(),
  getNotionSourceView: vi.fn(),
  listNotionSources: vi.fn(),
  updateNotionSource: vi.fn(),
}));
vi.mock("../subject/subject-leaf.js", () => ({ findSubjectAssignmentError: vi.fn() }));

const repo = await import("./notion-ingestion-source.repo.js");
const { findSubjectAssignmentError } = await import("../subject/subject-leaf.js");
const {
  handleCreateNotionSource,
  handleDeleteNotionSource,
  handleListNotionSources,
  handleUpdateNotionSource,
} = await import("./notion-ingestion-source.controller.js");

const ID = "0123456789abcdef0123456789abcdef";
const validBody = { name: "Phrases", pageUrl: `https://www.notion.so/P-${ID}`, subjectId: "sub_1" };

const view: NotionIngestionSource = {
  id: "nis_1",
  name: "Phrases",
  pageUrl: validBody.pageUrl,
  subjectId: "sub_1",
  subjectPath: ["English", "English for IT"],
  itemsPerRun: 20,
  frequency: "manual",
  removeAfterImport: false,
  paused: false,
  nextRunAt: null,
  lastRun: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findSubjectAssignmentError).mockResolvedValue(null);
  vi.mocked(repo.getNotionSourceView).mockResolvedValue(view);
});

describe("handleCreateNotionSource", () => {
  it("should refuse a link that is not a Notion page so nothing is stored", async () => {
    const res = fakeRes();

    await handleCreateNotionSource(fakeReq({ ...validBody, pageUrl: "https://evil.com/x" }), res);

    expect(res.status).toBe(400);
    expect(repo.createNotionSource).not.toHaveBeenCalled();
  });

  it("should refuse an unknown subject", async () => {
    vi.mocked(findSubjectAssignmentError).mockResolvedValue("subject_not_found");

    const res = fakeRes();

    await handleCreateNotionSource(fakeReq(validBody), res);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "subject_not_found" });
  });

  it("should answer 409 when the page is already a source", async () => {
    vi.mocked(repo.createNotionSource).mockResolvedValue({ kind: "duplicate_page" });

    const res = fakeRes();

    await handleCreateNotionSource(fakeReq(validBody), res);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "page_already_added" });
  });

  it("should store the source with removal off and 20 items by default", async () => {
    vi.mocked(repo.createNotionSource).mockResolvedValue({
      kind: "created",
      source: { id: "nis_1" } as never,
    });

    const res = fakeRes();

    await handleCreateNotionSource(fakeReq(validBody), res);

    expect(res.status).toBe(201);
    expect(repo.createNotionSource).toHaveBeenCalledWith(
      expect.objectContaining({ itemsPerRun: 10, frequency: "manual", removeAfterImport: false }),
    );
  });
});

describe("handleUpdateNotionSource", () => {
  it("should answer 404 for an unknown source", async () => {
    vi.mocked(repo.updateNotionSource).mockResolvedValue({ kind: "not_found" });

    const res = fakeRes();

    await handleUpdateNotionSource(fakeReq({ paused: true }), res, "nis_x");

    expect(res.status).toBe(404);
  });

  it("should refuse a patch that moves the source to a page already added", async () => {
    vi.mocked(repo.updateNotionSource).mockResolvedValue({ kind: "duplicate_page" });

    const res = fakeRes();

    await handleUpdateNotionSource(fakeReq({ pageUrl: validBody.pageUrl }), res, "nis_1");

    expect(res.status).toBe(409);
  });

  it("should refuse more than 100 items per run", async () => {
    const res = fakeRes();

    await handleUpdateNotionSource(fakeReq({ itemsPerRun: 500 }), res, "nis_1");

    expect(res.status).toBe(400);
    expect(repo.updateNotionSource).not.toHaveBeenCalled();
  });

  it("should return the updated source", async () => {
    vi.mocked(repo.updateNotionSource).mockResolvedValue({ kind: "updated", source: {} as never });

    const res = fakeRes();

    await handleUpdateNotionSource(fakeReq({ paused: true }), res, "nis_1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(view);
  });
});

describe("handleDeleteNotionSource and handleListNotionSources", () => {
  it("should answer 404 when deleting an unknown source", async () => {
    vi.mocked(repo.deleteNotionSource).mockResolvedValue(false);

    const res = fakeRes();

    await handleDeleteNotionSource(res, "nis_x");

    expect(res.status).toBe(404);
  });

  it("should delete a known source", async () => {
    vi.mocked(repo.deleteNotionSource).mockResolvedValue(true);

    const res = fakeRes();

    await handleDeleteNotionSource(res, "nis_1");

    expect(res.body).toEqual({ deleted: true });
  });

  it("should list sources", async () => {
    vi.mocked(repo.listNotionSources).mockResolvedValue([view]);

    const res = fakeRes();

    await handleListNotionSources(res);

    expect(res.body).toEqual({ sources: [view] });
  });
});
