import { describe, it, expect } from "vitest";
import { formatProgressLabel } from "./progress-label.js";

describe("formatProgressLabel", () => {
  it("renders an empty bar at 0", () => {
    expect(formatProgressLabel(0)).toBe("░░░░░ 0%");
  });

  it("renders a partial bar at 40", () => {
    expect(formatProgressLabel(40)).toBe("██░░░ 40%");
  });

  it("renders a fuller bar at 80", () => {
    expect(formatProgressLabel(80)).toBe("████░ 80%");
  });

  it("renders a full bar at 100", () => {
    expect(formatProgressLabel(100)).toBe("█████ 100%");
  });

  it("clamps values above 100", () => {
    expect(formatProgressLabel(140)).toBe("█████ 100%");
  });

  it("clamps negative values", () => {
    expect(formatProgressLabel(-20)).toBe("░░░░░ 0%");
  });
});
