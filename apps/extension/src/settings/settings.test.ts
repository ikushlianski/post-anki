import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCaptureText } from "../capture/build-capture-text.js";
import { DEFAULT_BASE_URL, getSettings, getWebUrl, saveSettings } from "./settings.js";

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

  it("should return the stored default subject when one exists", async () => {
    await chrome.storage.local.set({ settings: { baseUrl: DEFAULT_BASE_URL, token: "", subjectId: " s1 " } });

    expect(await getSettings()).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "", subjectId: "s1" });
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

  it("should persist the chosen subject so captures are sent with it", async () => {
    await saveSettings({ baseUrl: "", token: "", subjectId: " s1 " });

    const settings = await getSettings();

    expect(settings.subjectId).toBe("s1");
    expect(
      buildCaptureText({ selection: "hello", pageUrl: "https://a.example", subjectId: settings.subjectId }),
    ).toMatchObject({ ok: true, body: { subjectId: "s1" } });
  });

  it("should leave subjectId out when the empty choice is saved", async () => {
    await saveSettings({ baseUrl: "", token: "", subjectId: "s1" });
    await saveSettings({ baseUrl: "", token: "", subjectId: "" });

    const settings = await getSettings();

    expect(settings).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "" });

    const built = buildCaptureText({ selection: "hello", pageUrl: "https://a.example", subjectId: settings.subjectId });

    expect(built.ok && "subjectId" in built.body).toBe(false);
  });

  it("should keep the saved web URL and subject when settings are saved again", async () => {
    await chrome.storage.local.set({ webUrl: "http://localhost:6000" });
    await saveSettings({ baseUrl: "", token: "t", subjectId: "s1" });
    await saveSettings({ baseUrl: "", token: "t2", subjectId: "s1" });

    expect(await getWebUrl()).toBe("http://localhost:6000");
    expect((await getSettings()).subjectId).toBe("s1");
  });
});
