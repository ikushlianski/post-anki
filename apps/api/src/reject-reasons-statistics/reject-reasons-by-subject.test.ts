import { describe, expect, it } from "vitest";
import { buildBySubject } from "./reject-reasons-by-subject.js";

describe("buildBySubject", () => {
  it("should rank subjects by reject rate and hide those with fewer than five decisions", () => {
    const result = buildBySubject([
      { subjectName: "Go", decided: 10, rejected: 2 },
      { subjectName: "Rust", decided: 4, rejected: 4 },
      { subjectName: "SQL", decided: 5, rejected: 4 },
    ]);

    expect(result.map((s) => s.subjectName)).toEqual(["SQL", "Go"]);
    expect(result[0]?.rejectRate).toBeCloseTo(0.8);
  });

  it("should keep only the ten weakest subjects", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ subjectName: `S${i}`, decided: 5, rejected: i % 6 }));

    expect(buildBySubject(rows)).toHaveLength(10);
  });
});
