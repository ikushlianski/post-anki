# Scenarios — tag-strength-surface

- [ ] GET /tags/mastery returns every tag that exists, even one with zero scored attempts (status
  "new"/"untested"), not just tags present in getTagMasteryLevels' map.
- [ ] A tag with 3+ non-adjacent Ok attempts shows status "mastered"/"strong".
- [ ] A tag whose latest attempt was NeedsReview or NeedsDeepDive shows status "struggling"/"weak".
- [ ] A tag with 1-2 Ok attempts (not yet at mastery threshold) shows status "practicing"/"shallow".
- [ ] The tags page renders a strength badge next to each existing tag chip, using the real labels
  (strong/shallow/weak/untested), verified in a real browser via /check-ui.
