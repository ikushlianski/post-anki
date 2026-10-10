import { buildCaptureText } from "./capture/build-capture-text.js";
import { sendCapture } from "./capture/send-capture.js";
import { getSettings } from "./settings/settings.js";

const MENU_ID = "send-to-post-anki";
const BADGE_CLEAR_MS = 4000;

function showBadge(text: "OK" | "ERR"): void {
  void chrome.action.setBadgeText({ text });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
  }, BADGE_CLEAR_MS);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Send to post-anki",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }

  const built = buildCaptureText({
    selection: info.selectionText ?? "",
    pageUrl: info.pageUrl ?? tab?.url ?? "",
  });

  if (!built.ok) {
    showBadge("ERR");

    return;
  }

  const result = await sendCapture(built.text, await getSettings());

  showBadge(result.ok ? "OK" : "ERR");
});
