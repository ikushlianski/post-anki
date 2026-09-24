# Scenarios — fill-in-the-blank variant

- [ ] Scanning an untouched bit calls the fill-blank agent and stores one variant
      (kind="fill_in_the_blank", order=0, prompt contains a `____` blank marker, answer is the
      blanked word/phrase) tied to that bit.
- [ ] A successful generation stamps fillBlankGeneratedAt on the bit so it is never rescanned.
- [ ] A bit already generated (fillBlankGeneratedAt set) is excluded from the next scan.
- [ ] A bit already failed (fillBlankGenerationFailedAt set) is excluded from the next scan — no
      automatic retry.
- [ ] An agent call that throws, returns an empty prompt/answer, or returns a prompt with no
      `____` blank marker, is caught: the bit is marked failed, no row is written, batch continues.
- [ ] One bit's failure never stops the rest of the batch.
- [ ] The scan is capped at 50 bits per call, same as the other generation scans.
- [ ] The trigger route returns real counts (scanned, generated, failed) on success and a 502 with
      a message on an unexpected throw, never a silent 200.
- [ ] A bit that already has a wh_question variant can independently receive a fill_in_the_blank
      variant too — the two generation passes and their terminal-state columns are fully
      independent (the unique index scopes by kind, so both rows coexist for the same bit).
