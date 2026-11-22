# Socratic courses: todo

## Shared types
- [ ] S1: Add verdictLine, hint and followUpQuestion to the Socratic eval schema
- [ ] S2: Add optional rung, nextTopic, missedConcepts and reviewFiledCount to Socratic result and summary schemas

## Core rules
- [ ] C1: Add pure rung rule from grade, prior tries and depth (ladder in spec.md)
- [ ] C2: Add pure leak guard that blanks hints overlapping the reference answer (spec.md rule)
- [ ] C3: Add pure next-topic picker: next included topic in course order with open concepts

## API
- [ ] A1: Generate and run migration adding turn reference_answer and rung, session review_filed_count and end_reason
- [ ] A2: Replace Socratic tutor agent instructions with the spec.md prompt draft (needs S1)
- [ ] A3: Build tutor input with data blocks, tag stripping, 4,000-char clip and last 4 same-concept tries
- [ ] A4: Answer path uses rung rule, follow-up question on misses, leak guard, stores reference answer and rung
- [ ] A5: Return tutor_unavailable 503 and release the turn when the model fails, never a fake grade
- [ ] A6: End a session at 30 answered turns with the normal summary and end_reason turn_cap
- [ ] A7: At session finalize, file revealed and skipped concepts as keyed review notes; add count to summary
- [ ] A8: Return nextTopic in the answer result when a topic completes, using the next-topic picker
- [ ] A9: Confirm the Telegram bot Socratic flow still handles replies with the new optional fields

## Web
- [ ] W1: Show an on-track badge from degree on each tutor reply in the web Socratic chat
- [ ] W2: Add a Finish button and session summary with missed concepts and sent-for-review count
- [ ] W3: Show a next-topic link on completion and a tutor-unavailable message on 503

## iOS and Mac
- [ ] I1: Add rung, nextTopic, missedConcepts and reviewFiledCount to the PostAnkiAPI Socratic models
- [ ] I2: Show an on-track badge per tutor reply in SocraticScreen on iPhone and Mac
- [ ] I3: Show sent-for-review count in the summary and a next-topic button on completion
- [ ] I4: Show tutor-unavailable message and restore the typed answer on a 503

## Evaluation
- [ ] E1: Add a Socratic tutor eval script with five scripted personas over three high-load concepts
- [ ] E2: Run each persona three times and log results and cost in docs/ai-evals.md

## Notes
- Parallel wave 1: S1, S2, C1, C2, C3, A1 (no shared files).
- Shared file owners: S1 and S2 own packages/shared socratic.ts, run them in one dispatch.
- A2 owns the agent file; A3 owns a new prompt-builder file; both need S1.
- A4, A5, A6, A7, A8 all touch the Socratic service: run in that order, one at a time.
- A4 first moves reply composition out of the 600-line service into its own file.
- A4 needs A1, A3, C1, C2, S2. A7 needs A1, S2. A8 needs C3, S2. A9 needs A4.
- Web W1-W3 own the web Socratic chat and need S2; run as one dispatch, parallel to iOS.
- iOS I1 first, then I2-I4 in one dispatch on SocraticScreen and SocraticModel; needs S2.
- E1 needs A2 and A3; E2 spends real tokens, run once A4 is in.

