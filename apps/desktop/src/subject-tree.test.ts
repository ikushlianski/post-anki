import { describe, expect, it } from "vitest";
import type { Subject } from "@/api/desktop-commands";
import {
  buildSubjectTree,
  countDescendants,
  flattenWithDepth,
  subjectPath,
  type SubjectNode,
} from "@/subject-tree";

function subject(id: string, name: string, parentId: string | null = null): Subject {
  return { id, name, parentId };
}

function names(nodes: SubjectNode[]): string[] {
  return nodes.map((node) => node.subject.name);
}

describe("buildSubjectTree", () => {
  it("should place each child under its parent with children sorted by name", () => {
    const tree = buildSubjectTree([
      subject("b", "Business"),
      subject("m", "Marketing", "b"),
      subject("s", "Sales", "b"),
    ]);

    expect(names(tree)).toEqual(["Business"]);
    expect(names(tree[0].children)).toEqual(["Marketing", "Sales"]);
  });

  it("should nest to any depth", () => {
    const tree = buildSubjectTree([
      subject("b", "Business"),
      subject("s", "Sales", "b"),
      subject("c", "Cold sales", "s"),
    ]);

    expect(tree[0].children[0].children[0].subject.name).toBe("Cold sales");
  });

  it("should treat a subject whose parent is missing as a root", () => {
    const tree = buildSubjectTree([subject("o", "Orphan", "gone"), subject("b", "Business")]);

    expect(names(tree)).toEqual(["Business", "Orphan"]);
  });

  it("should keep every subject exactly once when a parent cycle exists", () => {
    const tree = buildSubjectTree([
      subject("a", "Alpha", "b"),
      subject("b", "Beta", "a"),
      subject("r", "Root"),
    ]);
    const flat = flattenWithDepth(tree, new Set(["a", "b", "r"]));

    expect(flat.map((row) => row.subject.id).sort()).toEqual(["a", "b", "r"]);
  });

  it("should treat a subject that is its own parent as a root", () => {
    const tree = buildSubjectTree([subject("s", "Self", "s")]);

    expect(names(tree)).toEqual(["Self"]);
    expect(tree[0].children).toEqual([]);
  });
});

describe("flattenWithDepth", () => {
  const tree = buildSubjectTree([
    subject("b", "Business"),
    subject("s", "Sales", "b"),
    subject("c", "Cold sales", "s"),
  ]);

  it("should show only the roots when nothing is expanded", () => {
    expect(flattenWithDepth(tree, new Set())).toEqual([
      { subject: subject("b", "Business"), depth: 0, hasChildren: true },
    ]);
  });

  it("should show direct children but not grandchildren when only the root is expanded", () => {
    const rows = flattenWithDepth(tree, new Set(["b"]));

    expect(rows.map((row) => [row.subject.name, row.depth])).toEqual([
      ["Business", 0],
      ["Sales", 1],
    ]);
  });

  it("should show the full depth when every ancestor is expanded", () => {
    const rows = flattenWithDepth(tree, new Set(["b", "s"]));

    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2]);
    expect(rows[2].hasChildren).toBe(false);
  });
});

describe("subjectPath", () => {
  const all = [
    subject("b", "Business"),
    subject("s", "Sales", "b"),
    subject("c", "Cold sales", "s"),
  ];

  it("should join the names from the root down to the subject", () => {
    expect(subjectPath(all[2], all)).toBe("Business / Sales / Cold sales");
  });

  it("should return just the name for a root subject", () => {
    expect(subjectPath(all[0], all)).toBe("Business");
  });

  it("should stop at a missing parent instead of failing", () => {
    const orphan = subject("o", "Orphan", "gone");

    expect(subjectPath(orphan, [orphan])).toBe("Orphan");
  });

  it("should stop when a parent cycle would loop forever", () => {
    const first = subject("a", "Alpha", "b");
    const second = subject("b", "Beta", "a");

    expect(subjectPath(first, [first, second])).toBe("Beta / Alpha");
  });
});

describe("countDescendants", () => {
  it("should count every sub-subject at any depth so the delete warning is complete", () => {
    const all = [
      subject("b", "Business"),
      subject("s", "Sales", "b"),
      subject("c", "Cold calls", "s"),
      subject("m", "Marketing", "b"),
    ];

    expect(countDescendants("b", all)).toBe(3);
  });

  it("should count zero for a subject without children", () => {
    expect(countDescendants("m", [subject("m", "Marketing")])).toBe(0);
  });

  it("should stop counting instead of looping when the data holds a cycle", () => {
    const all = [subject("a", "A", "b"), subject("b", "B", "a")];

    expect(countDescendants("a", all)).toBe(1);
  });
});
