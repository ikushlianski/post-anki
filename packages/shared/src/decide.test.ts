import { describe, it, expect } from "vitest";
import { decideInput } from "./decide.js";

describe("decideInput", () => {
  describe("whitespace-only submissions", () => {
    it("rejects a whitespace-only decision even with a real opinion", () => {
      const result = decideInput.safeParse({ decision: "   ", opinion: "x" });

      expect(result.success).toBe(false);
    });

    it("rejects a whitespace-only opinion even with a real decision", () => {
      const result = decideInput.safeParse({ decision: "x", opinion: "   " });

      expect(result.success).toBe(false);
    });

    it("rejects both fields being whitespace-only", () => {
      const result = decideInput.safeParse({ decision: "", opinion: "" });

      expect(result.success).toBe(false);
    });

    it("rejects a decision made only of newlines and tabs", () => {
      const result = decideInput.safeParse({ decision: "\n\t  \n", opinion: "real opinion" });

      expect(result.success).toBe(false);
    });
  });

  describe("real content on both fields", () => {
    it("accepts and trims surrounding whitespace on both fields", () => {
      const result = decideInput.safeParse({
        decision: "  Should we move sessions from JWTs?  ",
        opinion: "  I'd keep JWTs because our API is stateless.  ",
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.decision).toBe("Should we move sessions from JWTs?");
        expect(result.data.opinion).toBe("I'd keep JWTs because our API is stateless.");
      }
    });
  });
});
