---
type: todo
branch: phrase-bank-mastery
task: Port phrase-bank spaced repetition with mastery tracking to the English subject
state: open
updated: 2026-07-25
---
# Todo: Phrase-bank spaced repetition with mastery tracking

## Decisions to make
Nothing to decide. All forks resolved autonomously — see spec.md's "Decisions made autonomously".

## To review / clarify
Nothing blocks implementation. One item is worth a human glance when someone is back, not because
it's unresolved but because it's the single most debatable call in the plan: spec.md's decision 6
(a struggling phrase returns to `practicing` on its first correct isolated attempt, rather than
after a fixed 2-3 successful reps). The source app's own description is genuinely ambiguous on this
point — a human with more context on how the source app's chat sessions actually behaved may want
to revise it. It is implemented and tested as specified in spec.md either way; this is a "maybe
revise later" note, not an open fork.

## Manual steps
No manual steps required. The migration runs through the existing `db:generate`/`db:migrate` npm
scripts; no new secrets, env vars, or external services are introduced.

## Post-deploy checks
No post-deploy checks needed — English batch practice (the feature this attaches to) has not been
deployed to real users yet, per tonight's wishlist log.
