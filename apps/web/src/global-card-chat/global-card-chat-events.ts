export const OPEN_GLOBAL_CARD_CHAT_EVENT = 'open-global-card-chat'

export function openGlobalCardChat(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OPEN_GLOBAL_CARD_CHAT_EVENT))
  }
}
