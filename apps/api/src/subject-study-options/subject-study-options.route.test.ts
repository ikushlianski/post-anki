import { describe, expect, it } from "vitest";
import { resolveRoute } from "../router.js";

describe("subject study options routes", () => {
  it("should resolve read and update of a subject's study options by subject id", () => {
    expect(resolveRoute("GET", "/subjects/s1/study-options")).toEqual({
      name: "getSubjectStudyOptions",
      params: { id: "s1" },
    });
    expect(resolveRoute("PATCH", "/subjects/s1/study-options")).toEqual({
      name: "updateSubjectStudyOptions",
      params: { id: "s1" },
    });
  });

  it("should resolve the study forecast of a subject by subject id", () => {
    expect(resolveRoute("GET", "/subjects/s1/study-forecast")).toEqual({
      name: "getSubjectStudyForecast",
      params: { id: "s1" },
    });
  });

  it("should not resolve unsupported methods", () => {
    expect(resolveRoute("DELETE", "/subjects/s1/study-options")).toBeNull();
  });
});
