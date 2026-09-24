---
type: scenarios
item: wh-question-variant
---

# Scenarios

- [ ] Scanning an untouched bit calls the knowledge-fisher agent and stores one wh_question variant
      (prompt + answer, kind="wh_question", order=0) tied to that bit.
- [ ] A successful generation stamps `whQuestionGeneratedAt` on the bit so it is never rescanned.
- [ ] A bit already generated (whQuestionGeneratedAt set) is excluded from the next scan.
- [ ] A bit already failed (whQuestionGenerationFailedAt set) is excluded from the next scan — no
      automatic retry loop, same terminal-state posture as tagging/placement failures.
- [ ] An agent call that throws, or returns an empty/invalid question or answer, is caught: the bit
      is marked failed, no row is written, and the batch continues to the next bit.
- [ ] One bit's failure never stops the rest of the batch — isolation matches
      `tagKnowledgeBits`/`placeKnowledgeBits`.
- [ ] The scan is capped at 50 bits per call, same as the tagging scan.
- [ ] The trigger route returns real counts (`scanned`, `generated`, `failed`) on success and a 502
      with a message on an unexpected throw, never a silent 200.
