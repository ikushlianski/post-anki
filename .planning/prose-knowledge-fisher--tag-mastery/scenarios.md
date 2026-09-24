# Scenarios — tag-mastery

- [ ] A tag with zero scored attempts reports status "new", masteryStage 0.
- [ ] A tag whose attempts are all verdict "Ok" reaches "mastered" after 3 non-adjacent corrects
  (MASTERY_THRESHOLD in mastery-state.ts), same threshold gap-mastery/phrase-bank already use.
- [ ] A tag with one "NeedsDeepDive"/"NeedsReview" attempt (not "Ok") resets to "struggling",
  masteryStage 0 — mirrors `applyAttemptToMasteryEntry`'s existing incorrect branch unchanged.
- [ ] Attempts are folded in `createdAt` order, not insertion/id order (matters if two attempts
  share a millisecond — order must still be deterministic).
- [ ] Attempts against DIFFERENT bits that share the same tag are all folded into that one tag's
  stream (not scoped to a single bit/variant).
- [ ] A batched call for multiple tagIds returns one independent fold per tag — one tag's attempts
  never leak into another tag's fold.
- [ ] An attempt against a bit with NO tags at all is simply absent from every tag's fold (no
  crash, no orphan bucket).
