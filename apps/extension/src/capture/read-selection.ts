import { readSelectionMarkdown } from "./read-selection-markdown.js";

type ScriptingApi = Pick<typeof chrome.scripting, "executeScript">;

export async function readSelection(
  tabId: number | undefined,
  scripting: ScriptingApi = chrome.scripting,
): Promise<string | null> {
  if (tabId === undefined) {
    return null;
  }

  try {
    const results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: readSelectionMarkdown });
    const value = results.map((entry) => entry.result).find((text): text is string => typeof text === "string" && text !== "");

    return value ?? null;
  } catch {
    return null;
  }
}
