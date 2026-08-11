import { describe, it, expect } from "vitest";
import { sessionElapsedMinutes } from "./session-elapsed";

describe("sessionElapsedMinutes", () => {
  it("computes whole minutes between start and now for the review summary", () => {
    const minutes = sessionElapsedMinutes(
      "2026-08-08T10:00:00.000Z",
      "2026-08-08T10:17:30.000Z",
    );

    expect(minutes).toBe(17);
  });

  it("is zero for a session that never started", () => {
    expect(sessionElapsedMinutes(null, "2026-08-08T10:17:30.000Z")).toBe(0);
  });
});
