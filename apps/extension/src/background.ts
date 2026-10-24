import { buildCaptureText } from "./capture/build-capture-text.js";
import { sendCapture } from "./capture/send-capture.js";
import { describeSendResult } from "./feedback/describe-send-result.js";
import { describeToast } from "./feedback/describe-toast.js";
import { openReviewTab } from "./feedback/open-review-tab.js";
import { showToast } from "./feedback/show-toast.js";
import { getSettings, getWebUrl } from "./settings/settings.js";

const MENU_ID = "send-to-post-anki";
const BADGE_CLEAR_MS = 4000;
const DEFAULT_TITLE = "post-anki capture";

function showStatus(badge: "..." | "OK" | "DUP" | "ERR", title: string): void {
  void chrome.action.setBadgeText({ text: badge });
  void chrome.action.setTitle({ title });
}

let clearTimer: ReturnType<typeof setTimeout> | undefined;

function clearStatusLater(): void {
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    void chrome.action.setBadgeText({ text: "" });
    void chrome.action.setTitle({ title: DEFAULT_TITLE });
  }, BADGE_CLEAR_MS);
}

chrome.action.onClicked.addListener(async () => {
  openReviewTab(await getWebUrl(), (properties) => chrome.tabs.create(properties));
});

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

  const settings = await getSettings();
  const built = buildCaptureText({
    selection: info.selectionText ?? "",
    pageUrl: tab?.url ?? info.pageUrl,
    title: tab?.title,
    subjectId: settings.subjectId,
  });

  if (!built.ok) {
    showStatus("ERR", "No text selected");
    clearStatusLater();
    void showToast(tab?.id, { kind: "error", text: "Select some text first." });

    return;
  }

  showStatus("...", "Sending...");

  const result = await sendCapture(built.body, settings);
  const feedback = describeSendResult(result, settings.baseUrl);

  showStatus(feedback.badge, feedback.title);
  clearStatusLater();
  void showToast(tab?.id, describeToast(result, settings.token !== ""));
});
