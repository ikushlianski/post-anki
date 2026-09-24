## review-factory report — fill-in-the-blank-variant

Outcome: FAIL, 4th consecutive failure, stuck — do not re-dispatch this slug for blind re-implementation.

Pass 1:
- Plan-correspondence: PASS (all 9 todo items and 9 scenarios genuinely satisfied, real citations)
- Mechanical checks: PASS (tsc clean, 818/818 tests)
- Structured verdict: FAIL — correctness FAIL, tests FAIL, security PASS, architecture PASS

Real gaps found (now logged as new Coding tasks in this folder's todo.md):
- Blank-marker validation accepts several bad shapes (punctuation-only blanks, a blank touching a
  letter, unicode lookalikes beyond the one tested, multiple visible blanks)
- The generated answer is never checked against the actual blanked term
- Any generation error (including a transient provider outage) permanently marks a bit failed —
  fillBlankGenerationFailedAt is never cleared, no retry path
- Two concurrent scans can pick the same bit, double-pay for the model call, and the losing
  insert's failure handler can mark an actually-successful bit as failed

Pass 2: skipped — Pass 1 FAILed.
