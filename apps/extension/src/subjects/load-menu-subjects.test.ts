import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMenuSubjects } from "./load-menu-subjects.js";

const cached = [{ id: "old", name: "Old" }];

describe("loadMenuSubjects", () => {
  let data: Record<string, unknown>;

  beforeEach(() => {
    data = { subjectsCache: cached };
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(data, items);
          }),
          remove: vi.fn(async (key: string) => {
            delete data[key];
          }),
        },
      },
    });
  });

  it("should refresh the cache with the subjects the server returns", async () => {
    const subjects = [{ id: "new", name: "New" }];

    expect(await loadMenuSubjects("u", "t", async () => ({ ok: true, subjects }))).toEqual({ kind: "subjects", subjects });
    expect(data["subjectsCache"]).toEqual(subjects);
  });

  it.each(["unauthorized", "forbidden"] as const)("should drop cached subjects and report a rejected token on %s", async (reason) => {
    expect(await loadMenuSubjects("u", "t", async () => ({ ok: false, reason }))).toEqual({ kind: "token-rejected" });
    expect(data).not.toHaveProperty("subjectsCache");
  });

  it("should keep showing cached subjects when the network is down", async () => {
    expect(await loadMenuSubjects("u", "t", async () => ({ ok: false, reason: "network" }))).toEqual({
      kind: "subjects",
      subjects: cached,
    });
  });

  it("should keep showing cached subjects on a server error", async () => {
    const result = await loadMenuSubjects("u", "t", async () => ({ ok: false, reason: "other", status: 503 }));

    expect(result).toEqual({ kind: "subjects", subjects: cached });
    expect(data["subjectsCache"]).toEqual(cached);
  });
});
