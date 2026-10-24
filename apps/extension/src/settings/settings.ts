export const DEFAULT_BASE_URL = "http://localhost:5560";
export const DEFAULT_WEB_URL = "http://localhost:5540";

export type Settings = { baseUrl: string; token: string; subjectId?: string };

export type SaveSettingsResult = { ok: true } | { ok: false; reason: "invalid_base_url" };

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

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  const baseUrl = typeof value?.baseUrl === "string" ? normalizeBaseUrl(value.baseUrl) : null;

  const subjectId = typeof value?.subjectId === "string" ? value.subjectId.trim() : "";

  return {
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    token: typeof value?.token === "string" ? value.token.trim() : "",
    ...(subjectId ? { subjectId } : {}),
  };
}

export async function saveSettings(input: Settings): Promise<SaveSettingsResult> {
  const baseUrl = input.baseUrl.trim() === "" ? DEFAULT_BASE_URL : normalizeBaseUrl(input.baseUrl);

  if (baseUrl === null) {
    return { ok: false, reason: "invalid_base_url" };
  }

  const subjectId = input.subjectId?.trim() ?? "";

  await chrome.storage.local.set({
    [STORAGE_KEY]: { baseUrl, token: input.token.trim(), ...(subjectId ? { subjectId } : {}) },
  });

  return { ok: true };
}

export async function getWebUrl(): Promise<string> {
  const stored = await chrome.storage.local.get(WEB_URL_KEY);
  const value = stored[WEB_URL_KEY];

  return (typeof value === "string" ? normalizeBaseUrl(value) : null) ?? DEFAULT_WEB_URL;
}
