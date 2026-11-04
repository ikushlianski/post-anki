import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildCaptureText } from "../capture/build-capture-text.js";
import { DEFAULT_BASE_URL, DEFAULT_WEB_URL, getSettings, getWebUrl, saveSettings } from "./settings.js";

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

  it("should always use the production API address, ignoring a saved one", async () => {
    await saveSettings({ baseUrl: "http://localhost:9000//", token: "" });

    expect((await getSettings()).baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("should reject a non-http base URL and keep the previous settings", async () => {
    await saveSettings({ baseUrl: "http://localhost:9000", token: "t" });

    expect(await saveSettings({ baseUrl: "ftp://x.example", token: "u" })).toEqual({
      ok: false,
      reason: "invalid_base_url",
    });
    expect(await getSettings()).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "t" });
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

  it("should save the web app address so the toolbar button opens it", async () => {
    await saveSettings({ baseUrl: "", token: "", webUrl: "https://app.example.com//" });

    expect(await getWebUrl()).toBe("https://app.example.com");
  });

  it("should fall back to the local web app when the address is cleared", async () => {
    await saveSettings({ baseUrl: "", token: "", webUrl: "https://app.example.com" });
    await saveSettings({ baseUrl: "", token: "", webUrl: "  " });

    expect(await getWebUrl()).toBe(DEFAULT_WEB_URL);
  });

  it("should reject a non-http web app address and keep every previous setting", async () => {
    await saveSettings({ baseUrl: "http://localhost:9000", token: "t", webUrl: "https://app.example.com" });

    expect(await saveSettings({ baseUrl: "http://localhost:9100", token: "u", webUrl: "ftp://x.example" })).toEqual({
      ok: false,
      reason: "invalid_web_url",
    });
    expect(await getSettings()).toEqual({ baseUrl: DEFAULT_BASE_URL, token: "t" });
    expect(await getWebUrl()).toBe("https://app.example.com");
  });

  it("should leave the saved web app address alone when a save does not include one", async () => {
    await saveSettings({ baseUrl: "", token: "", webUrl: "https://app.example.com" });
    await saveSettings({ baseUrl: "", token: "x" });

    expect(await getWebUrl()).toBe("https://app.example.com");
  });

  describe("bundled starter token", () => {
    beforeEach(() => {
      const storage = (globalThis as unknown as { chrome: { storage: unknown } }).chrome.storage;

      vi.stubGlobal("chrome", { storage, runtime: { getURL: (path: string) => path } });
      vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ token: "starter-token" }) })));
    });

    it("should use the bundled token before any settings were ever saved", async () => {
      expect((await getSettings()).token).toBe("starter-token");
    });

    it("should keep a deliberately emptied token empty instead of bringing the bundled one back", async () => {
      await saveSettings({ baseUrl: "", token: "" });

      expect((await getSettings()).token).toBe("");
    });

    it("should prefer the saved token over the bundled one", async () => {
      await saveSettings({ baseUrl: "", token: "mine" });

      expect((await getSettings()).token).toBe("mine");
    });
  });
});
