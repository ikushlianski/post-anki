import { readSelectionMarkdown } from "./read-selection-markdown.js";

type ScriptingApi = Pick<typeof chrome.scripting, "executeScript">;

function readPlainSelection(): string {
  return window.getSelection()?.toString() ?? "";
}

export type SelectionRead = { text: string | null; why: string };

export async function readSelectionWithReason(
  tabId: number | undefined,
  scripting: ScriptingApi = chrome.scripting,
): Promise<SelectionRead> {
  if (tabId === undefined) {
    return { text: null, why: "no active tab found" };
  }

  try {
    const results = await scripting.executeScript({ target: { tabId, allFrames: true }, func: readSelectionMarkdown });
    const value = results.map((entry) => entry.result).find((text): text is string => typeof text === "string" && text !== "");

    if (value !== undefined) {
      return { text: value, why: "" };
    }

    const plain = await scripting.executeScript({ target: { tabId, allFrames: true }, func: readPlainSelection });
    const plainValue = plain.map((entry) => entry.result).find((text): text is string => typeof text === "string" && text.trim() !== "");

    return plainValue === undefined ? { text: null, why: "the page returned no selection" } : { text: plainValue, why: "" };
  } catch (error) {
    return { text: null, why: `the page could not be read: ${error instanceof Error ? error.message : "unknown error"}` };
  }
}

export async function readSelection(tabId: number | undefined, scripting: ScriptingApi = chrome.scripting): Promise<string | null> {
  return (await readSelectionWithReason(tabId, scripting)).text;
}
