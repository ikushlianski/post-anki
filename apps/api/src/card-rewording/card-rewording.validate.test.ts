import { describe, expect, it } from "vitest";
import { validateRewordedVersions } from "./card-rewording.validate.js";

const original = { front: "Why does TCP use a three-way handshake?", back: "To sync sequence numbers" };

describe("validateRewordedVersions", () => {
  it("should drop a version that repeats the original front so the learner sees a genuinely new question", () => {
    const result = validateRewordedVersions(original, [
      { angle: "cause", prompt: "  why does TCP use a   three-way handshake? " },
      { angle: "reason", prompt: "What problem does the opening exchange of a TCP connection solve?" },
    ]);

    expect(result.map((v) => v.angle)).toEqual(["reason"]);
  });

  it("should drop a version that leaks the answer in the front", () => {
    const result = validateRewordedVersions(original, [
      { angle: "gap", prompt: "TCP opens with three packets to sync sequence numbers, which is ____?" },
      { angle: "situation", prompt: "Two hosts connect and must agree on counters. What happens first?" },
    ]);

    expect(result.map((v) => v.angle)).toEqual(["situation"]);
  });

  it("should drop empty and over-long fronts", () => {
    const result = validateRewordedVersions(original, [
      { angle: "cause", prompt: "   " },
      { angle: "gap", prompt: "x".repeat(301) },
      { angle: "reason", prompt: "Why do hosts exchange three packets before data?" },
    ]);

    expect(result.map((v) => v.angle)).toEqual(["reason"]);
  });

  it("should keep only one of two versions with the same front", () => {
    const result = validateRewordedVersions(original, [
      { angle: "cause", prompt: "Why three packets before data?" },
      { angle: "reason", prompt: "why three  packets before data?" },
    ]);

    expect(result).toHaveLength(1);
  });

  it("should keep at most 3 versions", () => {
    const result = validateRewordedVersions(original, [
      { angle: "cause", prompt: "Front one?" },
      { angle: "situation", prompt: "Front two?" },
      { angle: "gap", prompt: "Front three?" },
      { angle: "reason", prompt: "Front four?" },
    ]);

    expect(result.map((v) => v.prompt)).toEqual(["Front one?", "Front two?", "Front three?"]);
  });
});
