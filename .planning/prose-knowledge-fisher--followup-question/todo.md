# Local todo — followup-question

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [ ] Add knowledge-bit-followup-generator Mastra agent (cheap tier, knowledge-fisher persona)
- [ ] Wire follow-up generation into grade-knowledge-bit-variant-answer orchestrator
- [ ] Tests: agent, orchestrator (both verdict paths + not-found short-circuit), controller

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, additive response field only.

## Resolved
- Review found: a follow-up-generation failure (provider error/invalid output) propagated as an
  unguarded throw, turning an already-graded, already-persisted attempt into a 502 to the client —
  a retry would then double-insert the attempt row. Fixed by wrapping the follow-up call in
  try/catch, logging the failure, and returning `followUpQuestion: null` instead of erroring.
