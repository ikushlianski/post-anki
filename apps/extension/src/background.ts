import { buildCaptureText } from "./capture/build-capture-text.js";
import { readSelectionWithReason } from "./capture/read-selection.js";
import { runCapture, retryPendingCapture } from "./capture/run-capture.js";
import { describeSendResult } from "./feedback/describe-send-result.js";
import { describeToast } from "./feedback/describe-toast.js";
import { openReviewTab } from "./feedback/open-review-tab.js";
import { showToast } from "./feedback/show-toast.js";
import {
  buildSubjectMenu,
  buildTokenRejectedMenu,
  SEND_CURRENT_ID,
  subjectIdFromMenuId,
  TOKEN_REJECTED_ID,
} from "./menu/build-subject-menu.js";
import { getSettings, getWebUrl, saveSettings, type Settings } from "./settings/settings.js";
import type { Destination } from "./subjects/describe-subject-path.js";
import { loadMenuSubjects } from "./subjects/load-menu-subjects.js";
import { resolveDestination } from "./subjects/resolve-destination.js";

const BADGE_CLEAR_MS = 4000;
const DEFAULT_TITLE = "post-anki capture";

function showStatus(badge: "" | "..." | "OK" | "DUP" | "ERR", title: string): void {
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

const RETRY_HINT = " Click the toolbar button to retry.";

function reportOutcome(outcome: Awaited<ReturnType<typeof runCapture>>, baseUrl: string, destination?: Destination): void {
  const feedback = describeSendResult(outcome.result, baseUrl, destination);

  showStatus(feedback.badge, outcome.retryable ? `${feedback.title}.${RETRY_HINT}` : feedback.title);
  clearStatusLater();
}

async function captureSelection(
  settings: Settings,
  tab: chrome.tabs.Tab | undefined,
  fallbackSelection?: string,
  fallbackPageUrl?: string,
): Promise<void> {
  const read = await readSelectionWithReason(tab?.id);
  const built = buildCaptureText({
    selection: read.text ?? fallbackSelection ?? "",
    pageUrl: tab?.url ?? fallbackPageUrl,
    title: tab?.title,
    subjectId: settings.subjectId,
  });

  if (!built.ok) {
    showStatus("ERR", "No text selected");
    clearStatusLater();
    void showToast(tab?.id, { kind: "error", text: `Select some text first. (${read.why})` });

    return;
  }

  showStatus("...", "Sending...");

  const outcome = await runCapture(built.body, settings);
  const worked = outcome.result.ok || (!outcome.result.ok && outcome.result.reason === "already_added");
  const destination = worked ? await resolveDestination(settings) : undefined;

  reportOutcome(outcome, settings.baseUrl, destination);
  void showToast(tab?.id, describeToast(outcome.result, settings.token !== "", built.truncated, outcome.retryable, destination));
}

chrome.action.onClicked.addListener(async (tab) => {
  const settings = await getSettings();

  showStatus("...", "Retrying last capture...");

  const retried = await retryPendingCapture(settings);

  if (retried) {
    reportOutcome(retried, settings.baseUrl);
    void showToast(tab.id, describeToast(retried.result, settings.token !== "", false, retried.retryable));

    return;
  }

  showStatus("", DEFAULT_TITLE);
  openReviewTab(await getWebUrl(), (properties) => chrome.tabs.create(properties));
});

async function rebuildMenu(): Promise<void> {
  const settings = await getSettings();
  const loaded = await loadMenuSubjects(settings.baseUrl, settings.token);

  await chrome.contextMenus.removeAll();

  const entries = loaded.kind === "token-rejected" ? buildTokenRejectedMenu() : buildSubjectMenu(loaded.subjects, settings.subjectId);

  for (const entry of entries) {
    chrome.contextMenus.create({
      id: entry.id,
      title: entry.title,
      contexts: ["selection"],
      ...(entry.parentId ? { parentId: entry.parentId } : {}),
    });
  }
}

const MENU_REFRESH_ALARM = "refresh-subject-menu";

function scheduleMenuRefresh(): void {
  chrome.alarms.create(MENU_REFRESH_ALARM, { periodInMinutes: 5 });
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleMenuRefresh();
  void rebuildMenu();
});
chrome.runtime.onStartup.addListener(() => {
  scheduleMenuRefresh();
  void rebuildMenu();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MENU_REFRESH_ALARM) {
    void rebuildMenu();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes["settings"]) {
    void rebuildMenu();
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = String(info.menuItemId);

  if (menuId === TOKEN_REJECTED_ID) {
    void chrome.runtime.openOptionsPage();

    return;
  }

  const pickedSubjectId = subjectIdFromMenuId(menuId);

  if (menuId !== SEND_CURRENT_ID && pickedSubjectId === null) {
    return;
  }

  let settings = await getSettings();

  if (pickedSubjectId !== null) {
    await saveSettings({ ...settings, subjectId: pickedSubjectId });
    settings = await getSettings();
  }

  await captureSelection(settings, tab, info.selectionText, info.pageUrl);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "send-selection") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  await captureSelection(await getSettings(), tab);
});
