export const DEFAULT_BASE_URL = "https://post-anki-api-pl6jw2mdla-ew.a.run.app";
export const DEFAULT_WEB_URL = "https://postanki.ilya.online";

export type Settings = { baseUrl: string; token: string; subjectId?: string };

export type SaveSettingsInput = Settings & { webUrl?: string };

export type SaveSettingsResult = { ok: true } | { ok: false; reason: "invalid_base_url" | "invalid_web_url" };

const STORAGE_KEY = "settings";
const WEB_URL_KEY = "webUrl";

export function normalizeBaseUrl(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString().replace(/\/+$/, "");
}

async function readSeedToken(): Promise<string> {
  try {
    const response = await fetch(chrome.runtime.getURL("seed-token.json"));
    const body = (await response.json()) as { token?: unknown };

    return typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    return "";
  }
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  const subjectId = typeof value?.subjectId === "string" ? value.subjectId.trim() : "";
  const storedToken = typeof value?.token === "string" ? value.token.trim() : "";
  const neverSaved = value === undefined;

  return {
    baseUrl: DEFAULT_BASE_URL,
    token: neverSaved ? await readSeedToken() : storedToken,
    ...(subjectId ? { subjectId } : {}),
  };
}

export async function saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult> {
  const baseUrl = input.baseUrl.trim() === "" ? DEFAULT_BASE_URL : normalizeBaseUrl(input.baseUrl);

  if (baseUrl === null) {
    return { ok: false, reason: "invalid_base_url" };
  }

  const webUrl =
    input.webUrl === undefined ? undefined : input.webUrl.trim() === "" ? DEFAULT_WEB_URL : normalizeBaseUrl(input.webUrl);

  if (webUrl === null) {
    return { ok: false, reason: "invalid_web_url" };
  }

  const subjectId = input.subjectId?.trim() ?? "";

  await chrome.storage.local.set({
    [STORAGE_KEY]: { baseUrl, token: input.token.trim(), ...(subjectId ? { subjectId } : {}) },
    ...(webUrl === undefined ? {} : { [WEB_URL_KEY]: webUrl }),
  });

  return { ok: true };
}

export async function getWebUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(WEB_URL_KEY);
  const value = stored[WEB_URL_KEY];

  return (typeof value === "string" ? normalizeBaseUrl(value) : null) ?? DEFAULT_WEB_URL;
}
