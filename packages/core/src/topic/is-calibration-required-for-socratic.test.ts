import { describe, it, expect } from "vitest";
import { isCalibrationRequiredForSocratic } from "./is-calibration-required-for-socratic";

describe("isCalibrationRequiredForSocratic", () => {
  it("blocks Socratic dialogue for a course whose calibration quiz was never taken", () => {
    expect(isCalibrationRequiredForSocratic({ calibrationCompletedAt: null })).toBe(true);
  });

  it("opens Socratic dialogue once the course's calibration quiz has been completed", () => {
    expect(
      isCalibrationRequiredForSocratic({ calibrationCompletedAt: "2026-08-19T00:00:00.000Z" }),
    ).toBe(false);
  });
});
