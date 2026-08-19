import { describe, it, expect } from "vitest";
import { electDepthFromCalibration } from "./elect-depth-from-calibration";

describe("electDepthFromCalibration", () => {
  it("elects a deeper starting depth for a topic answered correctly than one answered wrong", () => {
    const elected = electDepthFromCalibration([
      { topicId: "top_strong", correct: true },
      { topicId: "top_weak", correct: false },
    ]);

    const strong = elected.find((e) => e.topicId === "top_strong")!;
    const weak = elected.find((e) => e.topicId === "top_weak")!;

    expect(strong.depth).toBe("deep");
    expect(weak.depth).toBe("awareness");
  });

  it("elects deep for a topic answered correctly across multiple calibration questions", () => {
    const elected = electDepthFromCalibration([
      { topicId: "top1", correct: true },
      { topicId: "top1", correct: true },
      { topicId: "top1", correct: true },
    ]);

    expect(elected).toEqual([{ topicId: "top1", depth: "deep" }]);
  });

  it("elects working for a topic with a mixed but majority-correct record", () => {
    const elected = electDepthFromCalibration([
      { topicId: "top1", correct: true },
      { topicId: "top1", correct: true },
      { topicId: "top1", correct: false },
    ]);

    expect(elected).toEqual([{ topicId: "top1", depth: "working" }]);
  });

  it("elects awareness for a topic with no correct answers at all", () => {
    const elected = electDepthFromCalibration([
      { topicId: "top1", correct: false },
      { topicId: "top1", correct: false },
    ]);

    expect(elected).toEqual([{ topicId: "top1", depth: "awareness" }]);
  });

  it("returns nothing for a topic the calibration quiz never asked about", () => {
    const elected = electDepthFromCalibration([]);

    expect(elected).toEqual([]);
  });
});
