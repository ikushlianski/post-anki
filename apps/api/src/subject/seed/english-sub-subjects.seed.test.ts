import { describe, expect, it } from "vitest";
import { ensureEnglishForItWithStore } from "./english-sub-subjects.seed.js";
import type { RootCapableSeedStore } from "./subject-seed.store.js";

interface Row {
  id: string;
  name: string;
  parentId: string | null;
}

function createMemoryStore(rows: Row[]): RootCapableSeedStore {
  let next = 0;

  return {
    async findRootByName(name) {
      return rows.find((r) => r.parentId === null && r.name === name)?.id ?? null;
    },
    async findChildByName(parentId, name) {
      return rows.find((r) => r.parentId === parentId && r.name === name)?.id ?? null;
    },
    async createRoot(name) {
      next += 1;
      rows.push({ id: `new_${next}`, name, parentId: null });

      return `new_${next}`;
    },
    async createChild(parentId, name) {
      next += 1;
      rows.push({ id: `new_${next}`, name, parentId });

      return `new_${next}`;
    },
  };
}

describe("ensureEnglishForItWithStore", () => {
  it("should create English and English for IT on an empty database", async () => {
    const rows: Row[] = [];
    const id = await ensureEnglishForItWithStore(createMemoryStore(rows));
    const child = rows.find((r) => r.id === id);
    const root = rows.find((r) => r.id === child?.parentId);

    expect(child?.name).toBe("English for IT");
    expect(root).toMatchObject({ name: "English", parentId: null });
  });

  it("should create nothing on a second call and return the same sub-subject", async () => {
    const rows: Row[] = [];
    const store = createMemoryStore(rows);
    const first = await ensureEnglishForItWithStore(store);
    const count = rows.length;

    expect(await ensureEnglishForItWithStore(store)).toBe(first);
    expect(rows).toHaveLength(count);
  });

  it("should reuse an existing English root instead of creating a second one", async () => {
    const rows: Row[] = [{ id: "eng", name: "English", parentId: null }];
    const id = await ensureEnglishForItWithStore(createMemoryStore(rows));

    expect(rows.filter((r) => r.name === "English")).toHaveLength(1);
    expect(rows.find((r) => r.id === id)?.parentId).toBe("eng");
  });
});
