# Review card chat
## review-card-chat

### Scope
- Chat about the card being reviewed, from the review screen on web, iPhone and Mac.
- Out of scope: Changing the grading or scheduling flow, and the triage chat.

### Goal
- While reviewing a card, the learner can open a chat about that card, ask follow-up questions and get an answer grounded in the card, then go back to the same card without losing their place.

### Criteria
- [x] A Chat action on the review screen of web, iPhone and Mac opens a chat about the current card without grading it
- [x] The chat reuses the existing single-item card chat and its answer shows the card as context
- [x] Closing the chat returns to the same card, with the answer revealed state kept
- [x] Chat messages are saved with the card so they appear later in the chat queue
- [x] Keyboard shortcut on web and Mac opens the chat
- [x] After chatting about a card, an accepted suggestion replaces or edits that card and the review continues with the next card

### Coding tasks
- [x] [blocked: user] Decide how a chat started on an approved card during review gets saved to the chat queue, because the queue only holds cards in the chat state.
  - Why: Approved cards cannot enter the chat queue today, and saving messages without queue entry would hide them.
  - Decision: Move the card back to the chat queue and pause its reviews, or save the chat on the card and show it in the queue without changing its state.
  - Default: Save the chat on the card and list such cards in the queue without changing their approval state.
- [x] After a chat about a card during review, the assistant proposes a fix for the doubtful card (replace it with a reworded card, edit it, or drop it) using the existing create-or-edit-from-chat suggestions, and the learner accepts or ignores it in one tap.
- [x] Make a card chat started during review appear in the chat queue with the card it came from, so doubts raised mid-review can be picked up later.
- [x] Add a Chat action to the iPhone and Mac review screens that opens the existing card chat for the current card, with a keyboard shortcut on Mac, and returns to the same card when closed.
- [x] Add a Chat action to the web review screen that opens the existing single-item card chat for the current card and returns to the same card when closed.

### Notes


