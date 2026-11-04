import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./stats.service.js", () => ({
  generateRecommendations: vi.fn(),
  getCurriculumStats: vi.fn(),
}));

const { generateRecommendations, getCurriculumStats } = await import("./stats.service.js");
const { handleGenerateRecommendations, handleGetCurriculumStats } =
  await import("./stats.controller.js");

function fakeRes(): http.ServerResponse & {
  status: number | null;
  body: unknown;
} {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & {
    status: number | null;
    body: unknown;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleGetCurriculumStats", () => {
  it("should answer 404 for an unknown curriculum", async () => {
    vi.mocked(getCurriculumStats).mockResolvedValue({ error: "not_found" });

    const res = fakeRes();

    await handleGetCurriculumStats(res, "cur_x");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should return the curriculum stats", async () => {
    const stats = { curriculumId: "cur_1" } as never;

    vi.mocked(getCurriculumStats).mockResolvedValue(stats);

    const res = fakeRes();

    await handleGetCurriculumStats(res, "cur_1");

    expect(getCurriculumStats).toHaveBeenCalledWith("cur_1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ curriculumId: "cur_1" });
  });
});

describe("handleGenerateRecommendations", () => {
  it("should answer 404 for an unknown curriculum", async () => {
    vi.mocked(generateRecommendations).mockResolvedValue({
      error: "not_found",
    });

    const res = fakeRes();

    await handleGenerateRecommendations(res, "cur_x");

    expect(res.status).toBe(404);
  });

  it("should return the generated recommendations", async () => {
    vi.mocked(generateRecommendations).mockResolvedValue({
      recommendations: [],
    } as never);

    const res = fakeRes();

    await handleGenerateRecommendations(res, "cur_1");

    expect(generateRecommendations).toHaveBeenCalledWith("cur_1", expect.any(String));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ recommendations: [] });
  });
});
