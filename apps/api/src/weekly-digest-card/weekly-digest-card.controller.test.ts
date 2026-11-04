import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./weekly-digest-card.service.js", () => ({ getWeeklyDigestCard: vi.fn() }));

const { getWeeklyDigestCard } = await import("./weekly-digest-card.service.js");
const { handleGetWeeklyDigestCard } = await import("./weekly-digest-card.controller.js");

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

describe("handleGetWeeklyDigestCard", () => {
  it("should return the weekly digest card as 200", async () => {
    const card = { chatBacklog: 2, topRejectReasons: [{ reason: "duplicate", count: 3, delta: 1 }] } as never;

    vi.mocked(getWeeklyDigestCard).mockResolvedValue(card);

    const res = fakeRes();

    await handleGetWeeklyDigestCard(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chatBacklog: 2, topRejectReasons: [{ reason: "duplicate", count: 3, delta: 1 }] });
  });

  it("should return a card with no reject reasons and an empty chat backlog for a quiet week", async () => {
    vi.mocked(getWeeklyDigestCard).mockResolvedValue({ chatBacklog: 0, topRejectReasons: [] } as never);

    const res = fakeRes();

    await handleGetWeeklyDigestCard(res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ chatBacklog: 0, topRejectReasons: [] });
  });
});
