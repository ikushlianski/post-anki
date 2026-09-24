# Scenarios — variant-attempts

- [ ] A learner submits a correct free-text answer to a variant's question and gets a high
      score/`Ok` verdict with feedback, stored as an attempt row
- [ ] A learner submits an incomplete or wrong answer and gets a lower score/`NeedsReview` or
      `NeedsDeepDive` verdict with feedback naming what's missing, stored as an attempt row
- [ ] Two attempts against the same variant are both preserved as separate history rows, neither
      overwriting the other
- [ ] Submitting an answer for a variant id that doesn't exist returns a real 404, never a silent
      empty/zero-score grade
- [ ] Grading is based on the variant's own prompt/answer text, not the source knowledge bit's raw
      body, so the feedback addresses the actual question asked
