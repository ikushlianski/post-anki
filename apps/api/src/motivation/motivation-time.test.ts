import { describe, expect, it } from "vitest";
import { localDateString } from "./motivation-time";

describe("localDateString", () => {
  it("should put a late-evening review on the learner's own calendar day", () => {
    const lateEveningLosAngeles = new Date("2026-10-11T03:30:00.000Z");

    expect(localDateString(lateEveningLosAngeles, "America/Los_Angeles")).toBe("2026-10-10");
    expect(localDateString(lateEveningLosAngeles, "UTC")).toBe("2026-10-11");
  });

  it("should move an early-morning moment forward for zones ahead of UTC", () => {
    expect(localDateString(new Date("2026-10-10T20:30:00.000Z"), "Asia/Tokyo")).toBe("2026-10-11");
  });
});
