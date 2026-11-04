import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./home.service.js", () => ({ getHomeSummary: vi.fn() }));
vi.mock("./home-study-overview.service.js", () => ({
  getStudyOverview: vi.fn(),
}));

const { getHomeSummary } = await import("./home.service.js");
const { getStudyOverview } = await import("./home-study-overview.service.js");
const { handleGetHomeSummary, handleGetStudyOverview } = await import("./home.controller.js");

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

describe("handleGetHomeSummary", () => {
  it("should return the home summary as 200", async () => {
    vi.mocked(getHomeSummary).mockResolvedValue({ dueToday: 3 } as never);

    const res = fakeRes();

    await handleGetHomeSummary(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ dueToday: 3 });
  });

  it("should return an empty summary for a user with no data", async () => {
    vi.mocked(getHomeSummary).mockResolvedValue({} as never);

    const res = fakeRes();

    await handleGetHomeSummary(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe("handleGetStudyOverview", () => {
  it("should default to UTC and the default window when no query is given", async () => {
    vi.mocked(getStudyOverview).mockResolvedValue({ activity: [] } as never);

    const res = fakeRes();

    await handleGetStudyOverview(res, "");

    expect(getStudyOverview).toHaveBeenCalledWith({
      tz: "UTC",
      days: expect.any(Number),
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activity: [] });
  });

  it("should pass a valid time zone and window through", async () => {
    vi.mocked(getStudyOverview).mockResolvedValue({ activity: [] } as never);

    await handleGetStudyOverview(fakeRes(), "tz=Europe/Warsaw&days=7");

    expect(getStudyOverview).toHaveBeenCalledWith({
      tz: "Europe/Warsaw",
      days: 7,
    });
  });

  it.each(["tz=Not/AZone", "days=0", "days=abc", "days=100000"])(
    "should refuse %s with 400",
    async (search) => {
      const res = fakeRes();

      await handleGetStudyOverview(res, search);

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ error: "invalid_input" });
      expect(getStudyOverview).not.toHaveBeenCalled();
    },
  );
});
