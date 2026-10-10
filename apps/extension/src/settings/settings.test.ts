import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_BASE_URL, getSettings, saveSettings } from "./settings.js";

function stubStorage() {
  const data: Record<string, unknown> = {};

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
}

describe("settings", () => {
  beforeEach(() => {
    stubStorage();
  });

  it("should default to the local API with no token when nothing is saved", async () => {
    expect(await getSettings()).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "" });
  });

  it("should strip trailing slashes from the saved base URL", async () => {
    await saveSettings({ baseUrl: "http://localhost:9000//", token: "" });

    expect((await getSettings()).baseUrl).toBe("http://localhost:9000");
  });

  it("should reject a non-http base URL and keep the previous settings", async () => {
    await saveSettings({ baseUrl: "http://localhost:9000", token: "t" });

    expect(await saveSettings({ baseUrl: "ftp://x.example", token: "u" })).toEqual({
      ok: false,
      reason: "invalid_base_url",
    });
    expect(await getSettings()).toEqual({ baseUrl: "http://localhost:9000", token: "t" });
  });

  it("should reject a malformed base URL", async () => {
    expect(await saveSettings({ baseUrl: "nope", token: "" })).toEqual({
      ok: false,
      reason: "invalid_base_url",
    });
  });

  it("should store the token trimmed and treat it as optional", async () => {
    await saveSettings({ baseUrl: "", token: "  secret  " });

    expect(await getSettings()).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "secret" });
  });
});
