# Every chat sends a bounded conversation

## The ask

A long chat must not grow the model prompt, and its cost, without limit. Each chat turn sends only
the most recent part of the conversation.

## What to do

Each chat request carries the whole conversation so far. Each message is capped in length, but the
number of messages is not, and four chat services pass the full transcript into the prompt: card
chat, Q&A chat, study chat and global card chat. Only the draft-from-chat service keeps just the
last N messages (`MAX_DRAFT_TRANSCRIPT_MESSAGES`, `apps/api/src/knowledge-bit/knowledge-bit-chat-draft.service.ts:23`).

1. Apply the same "keep the last N messages" trim in every chat service that builds a prompt from a
   transcript. Use one shared limit, defined where the draft limit lives, unless a service has a
   clear reason for its own. Trimming keeps the newest messages, and must not leave the prompt
   starting on an assistant reply when the provider or the prompt shape needs a user turn first.
2. Put a generous hard maximum on the transcript array in the shared request schemas
   (`packages/shared/src/*chat*.ts` and the curriculum chat schema if it carries a transcript), so a
   request can't carry an arbitrarily large body. Set it well above the trim limit, so normal
   clients never hit it. Over the max, the request is rejected through the existing validation
   error path.

The current user message is always sent in full and never counts against the trim.

## Files to touch

The chat services in `apps/api/src/{knowledge-bit,qa-chat,study-chat,global-card-chat}/`, the
shared chat schemas in `packages/shared/src/`, and co-located tests.

## Done when

Tests for each chat service show that a transcript longer than the limit reaches the model as only
its newest messages plus the current message, and schema tests show an over-max transcript is
rejected while a normal one passes.
