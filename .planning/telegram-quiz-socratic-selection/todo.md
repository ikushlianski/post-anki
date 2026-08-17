---
type: todo
branch: main
task: Telegram bot — subject → curriculum → (Socratic | quiz) selection and continuation
state: open
updated: 2026-08-09
---

# Todo: Telegram quiz + Socratic subject/curriculum selection

## Decisions to make

Nothing to decide — this plan proposes no changes. One interpretation made during review is logged below for review.

## To review / clarify

1. Whether the learner explicitly picks quiz or conversation mode, or the app picks it automatically, was ambiguous in the request. The shipped app picks automatically based on whether the topic has been started before. If explicit choice was actually intended, that would be a small follow-up, not built here.

2. "Quiz on that course" was read as a quiz scoped to an existing topic or section, not a whole-course test — flag if a full-course quiz mode was actually wanted.

3. Free text sent while a quiz is active doesn't do anything — quiz answers are meant to be tapped as buttons, not typed. This is intentional, not a gap.

4. It isn't fully confirmed whether an abandoned quiz or conversation session stays resumable forever rather than expiring — likely intentional (nothing lost), but not independently verified across every abandonment path.

## Manual steps

- Turn on the live bot's production message delivery — this one-time activation is still pending.
- No database change or new credential is needed — everything else required is already in place.

## Post-deploy checks

- Message the bot to start a conversation and confirm the list of subjects renders.
- Start a brand-new topic and confirm a quiz batch is generated once, and resuming it doesn't regenerate it.
- Start a topic already in progress and confirm a conversation turn renders, and resuming continues that same conversation.
- Record this bot's shipped design and activation in the project's decision log, which currently has no entry for it.
