import { describe, expect, it } from "vitest";

import { orderSubjectTree } from "./order-subject-tree.js";

const subjects = [
  { id: "sales-common", name: "Common", parentId: "sales" },
  { id: "hr-common", name: "Common", parentId: "hr" },
  { id: "hr", name: "HR", parentId: "biz" },
  { id: "sales", name: "Sales", parentId: "biz" },
  { id: "biz", name: "Business" },
  { id: "pl", name: "Polish" },
  { id: "hr-deep", name: "Hiring", parentId: "hr-common" },
];

describe("orderSubjectTree", () => {
  it("should list each subject right after its parent, siblings by name, at every depth", () => {
    expect(orderSubjectTree(subjects).map((entry) => entry.subject.id)).toEqual([
      "biz",
      "hr",
      "hr-common",
      "hr-deep",
      "sales",
      "sales-common",
      "pl",
    ]);
  });

  it("should label same-named subjects by their full parent path so they can be told apart", () => {
    const labels = orderSubjectTree(subjects).map((entry) => entry.label);

    expect(labels).toContain("Business › HR › Common");
    expect(labels).toContain("Business › Sales › Common");
    expect(labels).toContain("Business › HR › Common › Hiring");
  });

  it("should treat a subject whose parent is unknown as top level", () => {
    expect(orderSubjectTree([{ id: "a", name: "A", parentId: "missing" }])[0]).toMatchObject({ depth: 0, label: "A" });
  });

  it("should not loop forever on a parent cycle", () => {
    const cyclic = [
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ];

    expect(orderSubjectTree(cyclic)).toEqual([]);
  });
});
