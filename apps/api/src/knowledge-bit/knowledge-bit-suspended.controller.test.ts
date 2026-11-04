import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRes } from "../shared/fake-http.test-mocks.js";

const listSuspendedKnowledgeBits = vi.fn();

vi.mock("./knowledge-bit-suspended.repo.js", () => ({
  listSuspendedKnowledgeBits: (...args: unknown[]) => listSuspendedKnowledgeBits(...args),
}));

const { handleListSuspendedKnowledgeBits } = await import("./knowledge-bit-suspended.controller.js");

describe("list suspended knowledge bits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["limit=0", "limit=51", "limit=abc", "offset=-1", "offset=1.5"])(
    "should answer 400 and not query when the paging is %s",
    async (search) => {
      const res = fakeRes();

      await handleListSuspendedKnowledgeBits(res, search);

      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("invalid_input");
      expect(listSuspendedKnowledgeBits).not.toHaveBeenCalled();
    },
  );

  it("should default to the first page of 50 when no paging is given", async () => {
    listSuspendedKnowledgeBits.mockResolvedValue({ items: [], total: 0 });
    const res = fakeRes();

    await handleListSuspendedKnowledgeBits(res, "");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
    expect(listSuspendedKnowledgeBits).toHaveBeenCalledWith({ limit: 50, offset: 0 }, expect.any(Date));
  });

  it("should pass the requested page through to the list", async () => {
    listSuspendedKnowledgeBits.mockResolvedValue({ items: [], total: 0 });

    await handleListSuspendedKnowledgeBits(fakeRes(), "limit=10&offset=20");

    expect(listSuspendedKnowledgeBits).toHaveBeenCalledWith({ limit: 10, offset: 20 }, expect.any(Date));
  });
});
