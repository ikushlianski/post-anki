# Local todo — followup-question

## Decisions to make
- None open.

## To review-clarify
- None open.

## Coding tasks
- [x] Add knowledge-bit-followup-generator Mastra agent (cheap tier, knowledge-fisher persona)
- [x] Wire follow-up generation into grade-knowledge-bit-variant-answer orchestrator
- [x] Tests: agent, orchestrator (both verdict paths + not-found short-circuit), controller

## Manual steps
- None.

## Post-deploy checks
- None — no schema change, additive response field only.

## Resolved
- Review found: a follow-up-generation failure (provider error/invalid output) propagated as an
  unguarded throw, turning an already-graded, already-persisted attempt into a 502 to the client —
  a retry would then double-insert the attempt row. Fixed by wrapping the follow-up call in
  try/catch, logging the failure, and returning `followUpQuestion: null` instead of erroring.
- advisor caught a second, unreviewed gap: the follow-up agent never received the variant's
  `kind`, so an `Ok`-verdict fill-in-the-blank answer (bare-term reference, no reasoning ever
  probed) got the wh_question-style "push one level deeper" instruction instead of a real WHY
  question. Fixed by threading `kind` through the orchestrator/agent/prompt, making the `Ok`
  branch kind-conditional, and widening grounding to include `<question>` for fill-in-the-blank
  (whose reference answer is just the bare term). tsc + all 3 affected test files clean after.
