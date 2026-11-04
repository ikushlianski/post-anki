import { describe, expect, it } from "vitest";
import { buildSubjectPathLabels } from "./subject-path-labels.js";

describe("buildSubjectPathLabels", () => {
  const rows = [
    { id: "biz", name: "Business", parentId: null },
    { id: "sales", name: "Sales", parentId: "biz" },
    { id: "hr", name: "HR", parentId: "biz" },
    { id: "sales-common", name: "Common", parentId: "sales" },
    { id: "hr-common", name: "Common", parentId: "hr" },
  ];

  it("should tell two sub-subjects with the same name apart by their parent path", () => {
    const labels = buildSubjectPathLabels(rows);

    expect(labels.get("sales-common")).toBe("Business › Sales › Common");
    expect(labels.get("hr-common")).toBe("Business › HR › Common");
  });

  it("should keep a top-level subject as its plain name", () => {
    expect(buildSubjectPathLabels(rows).get("biz")).toBe("Business");
  });
});
