import type { Shortcut } from "../shortcuts-help/shortcut";

export type ChatQueueShortcut = Shortcut;
export const CHAT_QUEUE_SHORTCUTS: readonly ChatQueueShortcut[] = [
  { keys: "j", action: "Move down the list" },
  { keys: "k", action: "Move up the list" },
  { keys: "Enter", action: "Open the highlighted card" },
  { keys: "x", action: "Select or unselect the highlighted card" },
  { keys: "i", action: "Move the highlighted card to Inbox" },
  { keys: "s", action: "Snooze the highlighted card for 1 day" },
  { keys: "/ or Ctrl+K", action: "Search" },
  { keys: "?", action: "Show this help" },
  { keys: "Esc", action: "Close this help" },
];
