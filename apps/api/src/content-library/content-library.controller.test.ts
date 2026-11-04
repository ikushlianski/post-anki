import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRes } from "../shared/fake-http.test-mocks.js";

const listLibrarySources = vi.fn();
const refetchSource = vi.fn();

vi.mock("./content-library.repo.js", () => ({
  listLibrarySources: (...args: unknown[]) => listLibrarySources(...args),
}));

vi.mock("./content-library.service.js", () => ({
  refetchSource: (...args: unknown[]) => refetchSource(...args),
}));

const { handleListLibrarySources, handleRefetchSource } = await import("./content-library.controller.js");

describe("handleListLibrarySources", () => {
  it("should answer 200 with the library sources", async () => {
    listLibrarySources.mockResolvedValue([{ id: "a" }]);
    const res = fakeRes();

    await handleListLibrarySources(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "a" }]);
  });
});

describe("handleRefetchSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 404 when the source does not exist", async () => {
    refetchSource.mockResolvedValue({ error: "not_found" });
    const res = fakeRes();

    await handleRefetchSource(res, "nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should answer 400 not_refetchable for sources that are not links", async () => {
    refetchSource.mockResolvedValue({ error: "not_refetchable" });
    const res = fakeRes();

    await handleRefetchSource(res, "text-1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("not_refetchable");
  });

  it("should answer 200 with the refetch result", async () => {
    const result = { sourceId: "l1", outcome: "ok", lastFetchedAt: "2026-11-04T00:00:00.000Z", fetchedTextUpdated: true };
    refetchSource.mockResolvedValue(result);
    const res = fakeRes();

    await handleRefetchSource(res, "l1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
  });
});
