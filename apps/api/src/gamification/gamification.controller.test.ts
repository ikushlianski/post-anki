import type http from "node:http";
import { gamificationProfileSchema, type GamificationProfile } from "@post-anki/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("./gamification.service.js", () => ({ getGamificationProfile: vi.fn() }));

const { getGamificationProfile } = await import("./gamification.service.js");
const { handleGetGamificationProfile } = await import("./gamification.controller.js");

const profile: GamificationProfile = {
  player: { level: 2, totalPoints: 120, pointsIntoLevel: 20, pointsForNextLevel: 200 },
  todayPoints: 9,
  streak: { current: 2, longest: 4 },
  masteredCards: 1,
  badges: [
    {
      key: "streak-3",
      family: "streak",
      name: "3-day streak",
      description: "Study 3 days in a row.",
      threshold: 3,
      progress: 3,
      unlocked: true,
    },
  ],
};

describe("handleGetGamificationProfile", () => {
  it("should answer 200 with the learner's level, points, streak and badges", async () => {
    vi.mocked(getGamificationProfile).mockResolvedValue(profile);
    const writeHead = vi.fn();
    const end = vi.fn();

    await handleGetGamificationProfile({ writeHead, end } as unknown as http.ServerResponse);

    expect(writeHead).toHaveBeenCalledWith(200, expect.anything());
    expect(gamificationProfileSchema.parse(JSON.parse(String(end.mock.calls[0]?.[0])))).toEqual(profile);
  });
});
