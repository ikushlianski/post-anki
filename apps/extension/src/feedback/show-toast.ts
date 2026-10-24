import type { ToastMessage } from "./describe-toast.js";
import { renderPageToast } from "./page-toast.js";

type ScriptingApi = Pick<typeof chrome.scripting, "executeScript">;

export async function showToast(
  tabId: number | undefined,
  message: ToastMessage,
  scripting: ScriptingApi = chrome.scripting,
): Promise<boolean> {
  if (tabId === undefined) {
    return false;
  }

  try {
    await scripting.executeScript({ target: { tabId }, func: renderPageToast, args: [message] });

    return true;
  } catch {
    return false;
  }
}
