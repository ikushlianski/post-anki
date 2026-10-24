import { describe, expect, it } from "vitest";
import { researchInputFromMarker, researchMarkerFor } from "./curriculum-research-marker.js";

describe("research marker round trip", () => {
  it("should recover the doc URL and name from a url marker", () => {
    const marker = researchMarkerFor({ name: "Vite", docUrl: "https://vite.dev" });

    expect(researchInputFromMarker(marker)).toEqual({ name: "Vite", docUrl: "https://vite.dev" });
  });

  it("should recover a bare-name research with no doc URL", () => {
    const marker = researchMarkerFor({ name: "Rust ownership" });

    expect(researchInputFromMarker(marker)).toEqual({ name: "Rust ownership" });
  });
});
