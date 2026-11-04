import type http from "node:http";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const writeMotivationSettings = vi.hoisted(() => vi.fn());
const readProgressView = vi.hoisted(() => vi.fn());
const readSettings = vi.hoisted(() => vi.fn());
const pauseStreak = vi.hoisted(() => vi.fn());
const getGoalStreak = vi.hoisted(() => vi.fn());

vi.mock("./motivation-settings.repo.js", () => ({ writeMotivationSettings }));
vi.mock("./motivation-progress.orchestrator.js", () => ({ readProgressView }));
vi.mock("./motivation-session-summary.orchestrator.js", () => ({ readSessionSummary: vi.fn() }));
vi.mock("./motivation-today.orchestrator.js", () => ({ readSettings, readTodayView: vi.fn() }));
vi.mock("./motivation-weekly-summary.orchestrator.js", () => ({ readWeeklySummary: vi.fn() }));
vi.mock("../streak/streak.service.js", () => ({ getGoalStreak, pauseStreak }));

import {
  handleGetGoalStreak,
  handleGetMotivationProgress,
  handleGetMotivationSettings,
  handlePauseStreak,
  handlePutMotivationSettings,
} from "./motivation.controller.js";

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
  writeMotivationSettings.mockReset();
  readProgressView.mockReset();
  readSettings.mockReset();
  pauseStreak.mockReset();
  getGoalStreak.mockReset();
});

describe("motivation settings", () => {
  it("should return the saved settings", async () => {
    readSettings.mockResolvedValue({ timeZone: "UTC" });
    const res = fakeRes();

    await handleGetMotivationSettings(res);

    expect(sent(res)).toEqual({ status: 200, body: { timeZone: "UTC" } });
  });

  it("should answer 400 for an unknown time zone and save nothing", async () => {
    const res = fakeRes();

    await handlePutMotivationSettings(fakeReq({ timeZone: "Mars/Base" }), res);

    expect(sent(res).status).toBe(400);
    expect(writeMotivationSettings).not.toHaveBeenCalled();
  });

  it("should answer 400 for an empty update", async () => {
    const res = fakeRes();

    await handlePutMotivationSettings(fakeReq({}), res);

    expect(sent(res).status).toBe(400);
  });

  it("should save a valid change and return the result", async () => {
    writeMotivationSettings.mockResolvedValue({ timeZone: "Europe/Lisbon" });
    const res = fakeRes();

    await handlePutMotivationSettings(fakeReq({ timeZone: "Europe/Lisbon" }), res);

    expect(writeMotivationSettings).toHaveBeenCalledWith({ timeZone: "Europe/Lisbon" });
    expect(sent(res).status).toBe(200);
  });
});

describe("streak", () => {
  it("should return the goal streak", async () => {
    getGoalStreak.mockResolvedValue({ status: "active", current: 3 });
    const res = fakeRes();

    await handleGetGoalStreak(res);

    expect(sent(res)).toEqual({ status: 200, body: { status: "active", current: 3 } });
  });

  it("should answer 400 when the pause is longer than the maximum", async () => {
    const res = fakeRes();

    await handlePauseStreak(fakeReq({ days: 31 }), res);

    expect(sent(res).status).toBe(400);
    expect(pauseStreak).not.toHaveBeenCalled();
  });

  it("should pause for the given days", async () => {
    pauseStreak.mockResolvedValue({ status: "paused" });
    const res = fakeRes();

    await handlePauseStreak(fakeReq({ days: 7 }), res);

    expect(pauseStreak).toHaveBeenCalledWith(7);
    expect(sent(res).status).toBe(200);
  });
});

describe("handleGetMotivationProgress", () => {
  it("should answer 400 for a bad time zone", async () => {
    const res = fakeRes();

    await handleGetMotivationProgress(res, "tz=Mars%2FBase");

    expect(sent(res).status).toBe(400);
    expect(readProgressView).not.toHaveBeenCalled();
  });

  it("should answer 400 when days is below the minimum", async () => {
    const res = fakeRes();

    await handleGetMotivationProgress(res, "days=1");

    expect(sent(res).status).toBe(400);
  });

  it("should return the progress view for the window", async () => {
    readProgressView.mockResolvedValue({ days: [] });
    const res = fakeRes();

    await handleGetMotivationProgress(res, "days=30");

    expect(readProgressView.mock.calls[0]![1]).toBe(30);
    expect(sent(res).status).toBe(200);
  });
});
