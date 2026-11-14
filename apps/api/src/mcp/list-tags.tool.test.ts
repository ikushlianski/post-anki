import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../tag/tag.service.js", () => ({ getAllTags: vi.fn() }));

const { getAllTags } = await import("../tag/tag.service.js");
const { listAllTags } = await import("./list-tags.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("listAllTags", () => {
  it("should return tag ids and names only", async () => {
    vi.mocked(getAllTags).mockResolvedValue([{ id: "t1", name: "Verbs", normalizedName: "verbs" }]);

    expect(await listAllTags()).toEqual({ tags: [{ id: "t1", name: "Verbs" }] });
  });
});
