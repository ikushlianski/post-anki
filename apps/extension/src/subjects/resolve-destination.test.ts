import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveDestination } from "./resolve-destination.js";

const settings = { baseUrl: "u", token: "t" };

describe("resolveDestination", () => {
  let data: Record<string, unknown>;

  beforeEach(() => {
    data = { subjectsCache: [{ id: "sys", name: "Systems" }, { id: "hl", name: "High-load", parentId: "sys" }] };
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(data, items);
          }),
        },
      },
    });
  });

  it("should report no destination when no subject was ever chosen", async () => {
    const fetcher = vi.fn();

    expect(await resolveDestination(settings, fetcher)).toEqual({ kind: "none" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should name the full path from the cached list without a network call", async () => {
    const fetcher = vi.fn();

    expect(await resolveDestination({ ...settings, subjectId: "hl" }, fetcher)).toEqual({
      kind: "path",
      path: "Systems › High-load",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should refresh the list once when the subject is not cached and use the new name", async () => {
    const subjects = [{ id: "new", name: "Fresh" }];
    const fetcher = vi.fn(async () => ({ ok: true as const, subjects }));

    expect(await resolveDestination({ ...settings, subjectId: "new" }, fetcher)).toEqual({ kind: "path", path: "Fresh" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(data["subjectsCache"]).toEqual(subjects);
  });

  it("should say the subject is unknown when it is still missing after a refresh or the refresh fails", async () => {
    const empty = vi.fn(async () => ({ ok: true as const, subjects: [] }));
    const down = vi.fn(async () => ({ ok: false as const, reason: "network" as const }));
    const boom = vi.fn(async () => {
      throw new Error("x");
    });

    expect(await resolveDestination({ ...settings, subjectId: "x" }, empty)).toEqual({ kind: "unknown" });
    expect(await resolveDestination({ ...settings, subjectId: "x" }, down)).toEqual({ kind: "unknown" });
    expect(await resolveDestination({ ...settings, subjectId: "x" }, boom)).toEqual({ kind: "unknown" });
  });
});
