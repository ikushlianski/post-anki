import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./streak.service.js", () => ({ getStreak: vi.fn() }));

const { getStreak } = await import("./streak.service.js");
const { handleGetStreak } = await import("./streak.controller.js");

function fakeRes(): http.ServerResponse & { status: number | null; body: unknown } {
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

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleGetStreak", () => {
  it("should return the streak exactly as the service reports it", async () => {
    const streak = { currentStreak: 4, longestStreak: 9, lastActivityDate: "2026-01-01" } as never;

    vi.mocked(getStreak).mockResolvedValue(streak);

    const res = fakeRes();

    await handleGetStreak(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentStreak: 4, longestStreak: 9, lastActivityDate: "2026-01-01" });
  });

  it("should return a zero streak for a user with no activity", async () => {
    vi.mocked(getStreak).mockResolvedValue({ currentStreak: 0, longestStreak: 0, lastActivityDate: null } as never);

    const res = fakeRes();

    await handleGetStreak(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentStreak: 0, longestStreak: 0, lastActivityDate: null });
  });
});
