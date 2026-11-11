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
    const results = await scripting.executeScript({ target: { tabId }, func: readSelectionMarkdown });
    const value = results[0]?.result;

    return typeof value === "string" && value !== "" ? value : null;
  } catch {
    return null;
  }
}
