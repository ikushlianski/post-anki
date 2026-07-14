# Scenario: Socratic chat — real chat UI, typing indicator, blank re-ask

**Front door:** UI — Socratic mode on `/probe/:topicId`; one assertion also
drives the API directly (`POST /socratic-sessions/:id/answer`) to prove the
server-side blank-answer guard, which the UI's disabled-button check alone
can't demonstrate (a truly empty string never reaches the server through the
UI, since the send button is disabled).

**What it proves:**
- The chat renders as message bubbles with a visible typing indicator for the
  full duration of the in-flight evaluate call (SCENARIO 4).
- A fully correct answer advances the mentor to the next concept
  (SCENARIO 5), via the stubbed `socratic-eval` responder returning `correct`.
- A blank/whitespace-only answer re-asks the same turn — no wrong attempt
  recorded, no LLM call made, same turn re-served (SCENARIO 9).

**Asserts:**
- UI: `socratic-chat` renders with an opening `socratic-message-mentor` bubble.
- UI: the `socratic-typing-indicator` is visible immediately after sending an
  answer and detaches once the response renders.
- UI: after a correct answer, a new mentor message appears with "Right —
  that holds up." and (if another gap remains) a further mentor prompt.
- UI: the send button is disabled while the input is empty/whitespace-only —
  client-side mirror of the server's blank-answer bar.
- API/DB: posting a whitespace-only answer directly returns `action: "retry"`,
  `degree: null`, `next.id` equal to the current turn id, and does not add a
  wrong-answer row to `socratic_turns` for this gap (turn count for the gap
  stays at its prior value).
