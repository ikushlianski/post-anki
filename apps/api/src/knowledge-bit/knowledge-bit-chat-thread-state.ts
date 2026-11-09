const CHAT_THREAD_STATES = new Set(["chat", "approved", "pending", "inbox"]);

export function isChatThreadState(state: string | null): boolean {
  return state !== null && CHAT_THREAD_STATES.has(state);
}
