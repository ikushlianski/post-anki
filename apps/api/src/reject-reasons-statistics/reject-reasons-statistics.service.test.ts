import { describe, expect, it } from "vitest";
import { buildBySubjectType, buildRejectReasonsStatistics } from "./reject-reasons-statistics.service.js";

describe("buildRejectReasonsStatistics", () => {
  it("should report an empty breakdown when nothing was rejected", () => {
    expect(buildRejectReasonsStatistics([])).toEqual({ total: 0, reasons: [] });
  });

  it("should count legacy reasons and fold missing or unknown codes into no reason given", () => {
    const result = buildRejectReasonsStatistics([
      { reasonCode: "bad_format", count: 1 },
      { reasonCode: "text_recall_only", count: 4 },
      { reasonCode: null, count: 2 },
      { reasonCode: "unspecified", count: 1 },
      { reasonCode: "from_the_future", count: 2 },
    ]);

    expect(result.total).toBe(10);
    expect(result.reasons.map((r) => [r.reasonCode, r.count])).toEqual([
      ["unspecified", 5],
      ["text_recall_only", 4],
      ["bad_format", 1],
    ]);
    expect(result.reasons[0]?.share).toBeCloseTo(0.5);
  });
});

describe("buildBySubjectType", () => {
  it("should split rejections by the subject type so each type shows only its own reasons", () => {
    const result = buildBySubjectType(
      [
        { reasonCode: "front_unclear_target_phrase", subjectId: "en", count: 3 },
        { reasonCode: "no_code_context", subjectId: "ts", count: 2 },
        { reasonCode: "text_recall_only", subjectId: null, count: 1 },
      ],
      (subjectId) => (subjectId === "en" ? "language" : subjectId === "ts" ? "programming" : "other"),
    );

    expect(result.map((entry) => [entry.subjectType, entry.total])).toEqual([
      ["programming", 2],
      ["language", 3],
      ["business", 0],
      ["other", 1],
    ]);
    expect(result[1]?.reasons[0]?.reasonCode).toBe("front_unclear_target_phrase");
  });
});
