import { describe, expect, it } from "vitest";
import {
  BUSINESS_SUB_SUBJECTS,
  seedBusinessSubSubjects,
  type SubjectSeedNode,
  type SubjectSeedStore,
} from "./business-sub-subjects.seed.js";

interface Row {
  id: string;
  name: string;
  parentId: string | null;
}

function createMemoryStore(rows: Row[]): SubjectSeedStore {
  let next = 0;

  return {
    async findRootByName(name) {
      return rows.find((r) => r.parentId === null && r.name === name)?.id ?? null;
    },
    async findChildByName(parentId, name) {
      return (
        rows.find((r) => r.parentId === parentId && r.name.toLowerCase() === name.toLowerCase())
          ?.id ?? null
      );
    },
    async createChild(parentId, name) {
      next += 1;
      rows.push({ id: `new_${next}`, name, parentId });

      return `new_${next}`;
    },
  };
}

function pathOf(rows: Row[], row: Row): string {
  const parent = rows.find((r) => r.id === row.parentId);

  return parent ? `${pathOf(rows, parent)} / ${row.name}` : row.name;
}

function countNodes(nodes: SubjectSeedNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
}

describe("seedBusinessSubSubjects", () => {
  it("should place every sub-subject under Business and Cold sales under Sales", async () => {
    const rows: Row[] = [{ id: "biz", name: "Business", parentId: null }];

    await seedBusinessSubSubjects(createMemoryStore(rows));

    const paths = rows.map((r) => pathOf(rows, r));

    expect(paths).toContain("Business / Marketing");
    expect(paths).toContain("Business / Sales / Cold sales");
    expect(paths).toContain("Business / Management / Delegation");
    expect(paths).toContain("Business / Management / People management");
    expect(rows).toHaveLength(1 + countNodes(BUSINESS_SUB_SUBJECTS));
  });

  it("should create nothing when run a second time", async () => {
    const rows: Row[] = [{ id: "biz", name: "Business", parentId: null }];

    await seedBusinessSubSubjects(createMemoryStore(rows));

    const before = rows.length;
    const second = await seedBusinessSubSubjects(createMemoryStore(rows));

    expect(rows).toHaveLength(before);
    expect(second.created).toEqual([]);
  });

  it("should keep an existing sub-subject untouched and still fill its children", async () => {
    const rows: Row[] = [
      { id: "biz", name: "Business", parentId: null },
      { id: "s1", name: "sales", parentId: "biz" },
    ];

    await seedBusinessSubSubjects(createMemoryStore(rows));

    expect(rows.find((r) => r.id === "s1")?.name).toBe("sales");
    expect(rows.filter((r) => r.name.toLowerCase() === "sales")).toHaveLength(1);
    expect(rows.find((r) => r.name === "Cold sales")?.parentId).toBe("s1");
  });

  it("should not create a name that exists under a different parent", async () => {
    const rows: Row[] = [
      { id: "biz", name: "Business", parentId: null },
      { id: "eng", name: "English", parentId: null },
      { id: "m", name: "Marketing", parentId: "eng" },
    ];

    await seedBusinessSubSubjects(createMemoryStore(rows));

    expect(rows.filter((r) => r.name === "Marketing")).toHaveLength(2);
    expect(rows.find((r) => r.id === "m")?.parentId).toBe("eng");
  });

  it("should fail clearly when Business does not exist", async () => {
    await expect(seedBusinessSubSubjects(createMemoryStore([]))).rejects.toThrow(/Business/);
  });

  it("should stay within three levels below the top", () => {
    const depth = (nodes: SubjectSeedNode[]): number =>
      nodes.length === 0 ? 0 : 1 + Math.max(...nodes.map((n) => depth(n.children ?? [])));

    expect(depth(BUSINESS_SUB_SUBJECTS)).toBeLessThanOrEqual(2);
  });
});
