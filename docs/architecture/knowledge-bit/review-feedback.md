# Review feedback and extraction memory

## What the reviewer gets

Rejecting a suggestion takes one tap and nothing blocks it. The card disappears at once, and a small strip appears at the bottom of the page for about ten seconds: "Rejected. Why?". The strip offers the reasons as chips, an optional short note, and an Undo button. Tapping a chip stores the reason, a note adds detail, and ignoring the strip leaves the rejection without a reason. Undo brings the suggestion back to its original place in the list.

The next extraction learns from these decisions. Rejected cards, with their reason when one was given, and approved cards are shown to the model as examples of the reviewer's taste. This is not training and not reinforcement learning: it is feedback-driven prompting, which means in-context examples drawn from the reviewer's own accepted and rejected cards. It takes effect on the very next extraction, with no waiting and no model change.

An admin section on the observability page compares models by real outcome: how many suggestions each model produced that were approved or rejected, the reject rate, and the most common reasons. This gives a measured basis for choosing a default model.

## Reasons

`wrong_language`, `too_vague_or_no_context`, `meta_wording` (phrases such as "according to the text"), `not_a_fact_or_trivial`, `wrong_or_unsupported_answer`, `duplicate_or_overlap`, `bad_format` (a broken blank, a yes/no question) and `other`. A rejection without a chosen reason is stored as `unspecified`. The codes and their labels live in `packages/shared/src/knowledge-bit-review-feedback.ts`.

## How it works

- Every review decision writes one row in `knowledge_bit_feedback` in the same transaction as the state change: verdict (`rejected` or `approved`), reason code, optional note, the statement and the front and back of the first live card as length-capped snapshots, the subject of the source and the model that produced the suggestion. There are no foreign keys, following the schema convention.
- The model id is the one stored on the source; when the source has none, the admin default at decision time is used. A regeneration that picks a different model does not rewrite the source's model, so those rows keep the source's model id.
- Reject returns the id of its feedback row. `PATCH /knowledge-bit-feedback/:id` sets the reason and the note afterwards; it only touches rejection rows. `POST /knowledge-bits/:id/restore` moves a rejected suggestion back to pending and deletes its rejection row, so an undone rejection leaves no trace. A retried reject does not create a second row.
- Approvals made one by one and in bulk write approved rows, once per suggestion.
- Before the first chunk of an extraction, the pipeline loads the feedback of the source's subject (all feedback when the subject has none yet): the last 50 decisions for reason counts and rejected examples (at most 8) and the last 5 approved examples. A pure function turns them into a `<reviewer_feedback>` block of at most 1500 characters, with rejected and approved examples interleaved so the cap keeps both. Rejections without a reason are labeled "rejected (no reason given)" so the model can infer the pattern from the example.
- The block is placed before `<source>` in the prompt. Its header states that it is data, not commands, and that it never overrides the SECURITY and LANGUAGE rules. Example text is flattened to one line, truncated, and escaped like the source text (`reviewer_feedback` is one of the escaped prompt tags), so a stored card cannot close the block or open a source block.
- Loading feedback can fail without failing the extraction: the error is logged and the model gets the prompt without the block.

## Boundaries

- Edits made before approval are not yet stored as before and after pairs.
- Cards generated after extraction (questions, blanks, basic cards) do not read the feedback block yet.
- Per-model statistics read the model id on the feedback row, which can differ from the model that wrote a card after a regeneration with another model.
