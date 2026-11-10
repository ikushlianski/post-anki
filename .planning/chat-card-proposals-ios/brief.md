# iPhone chat: make a card, approve/reject in chat, retry the question

Goal
- In the iPhone chat, a "Make a card" button or typing "make a card that…" makes the model call its card tool and show a proposed card right in the thread, with Accept / Reject; a separate button asks for a new wording of the proposed card's question on demand (not automatically).

What already exists
- Branch `chat-queue-card-crafting` (Orca worktree `/Users/ikushlianski/orca/workspaces/post-anki/chat-queue-card-crafting`, 10 commits not on main, last 2026-11-08): tools `proposeNewCard` / `proposeCardUpdate` in `apps/api/src/mastra/knowledge-bit-chat-queue-proposal-tools.ts`, iOS `apps/ios/Sources/Shared/chat-queue-proposal-card.swift` with Accept / Reject, auto-reply on reject (web, Mac, iOS). Not merged, so not on the installed app.
- On main: iOS chat thread `apps/ios/Sources/Shared/chat-queue-thread-screen.swift` has a manual "Make a card" form (line ~143) and "Retry answer" (re-asks the whole reply, line ~152). Backlog direction `chat-queue-card-crafting` lists the tool and in-place triage items as open.

Scope
- In: land the branch on main (rebase, gates, release to iPhone); make sure "make a card that…" in free text triggers `proposeNewCard`; add a "Reword question" button on a proposed card that asks the model for a new front only, keeping the back, before the user accepts.
- Out: other chats (due-review chat sheet, knowledge item chat, topic chat) unless they share the same thread screen; persistent chat history.

Done when
- API tests cover: free-text card request → proposal, reword → new front, same back; iOS build over Wi-Fi shows proposal with Accept / Reject / Reword in a chat-queue thread; accepting saves a pending card.

Assumptions
- "During chatting" = the chat-queue thread (the chat a card is sent to).
- "Retry the question formulation" = reword the proposed card's question, not retry the chat answer (that button exists).
