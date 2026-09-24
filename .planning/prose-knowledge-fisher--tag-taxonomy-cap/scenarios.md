---
type: scenarios
direction: prose-knowledge-fisher
task: tag-taxonomy-cap
---

# Scenarios

- [ ] A candidate name that exact-matches an existing tag's normalized name reuses it, no LLM call
- [ ] A candidate name close in meaning to an existing tag reuses that tag while under the cap
- [ ] A genuinely new concept gets a new tag while the taxonomy is under the cap
- [ ] Once the taxonomy is at the cap, even a genuinely new concept reuses the nearest existing tag
- [ ] The taxonomy never exceeds the cap after any number of auto-tag calls
