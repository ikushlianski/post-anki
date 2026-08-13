---
type: todo
branch: To-Learn-List
task: learning list intake
state: open
updated: 2026-08-09
---

# Todo

## Coding tasks

- [x] 1. Validate source links before fetching them, and use that check everywhere content is fetched.
- [x] 2. Add logic to judge a content series and recommend where a topic belongs.
- [x] 3. Add logic to cap questions per topic, release topics in batches, and offer more depth.
- [x] 4. Add logic to track engagement, decide when to nudge the learner, and detect inactivity.
- [x] 9. Remove duplicate internal data definitions in favor of the shared ones.
- [x] 5. Set up storage for the new data, and seed starter topics for React, Node.js and AWS.
- [x] 10. Let a topic relate to more than one parent area, and link AWS under Cloud Computing too.
- [x] 11. Fix ordering conflicts among the newly seeded sub-subjects.
- [x] 6. Build the storage and API for the learning list, engagement tracking, and classification.
- [ ] 12. When a new series covers an existing course's topic, offer to extend it instead of creating a duplicate.
- [ ] 13. On approval, treat precise placements as confirmed and broader area matches as suggestions.
- [x] 7. Connect the new features to the API, and deliver nudges through the daily push.
- [x] 14. Track which source an answer came from, and release the next batch while engagement holds.
- [ ] 15. Generate new topics and questions with AI instead of only releasing pre-written ones.
- [x] 8. Build the web pages for capturing content, reviewing recommendations, the learning list, depth prompts and nudge responses.
- [x] 16. Distinguish topics not yet released from ones the learner opted out of, so releases can't bring back a dropped topic.
- [ ] 17. Spread topic releases out over time so a learner can't hit the cap in one sitting.
- [x] 18a. Track and expose when a learner opted into extra depth on a topic.
- [ ] 18b. Switch the web app to use the new depth-opt-in tracking instead of the old workaround.
- [x] 19. Store when a learner declines an offer for extra depth (not yet connected to the web app).

## Manual steps

- [ ] Allow-list safe source domains in the end-to-end test configuration.
- [ ] Set up the architecture documentation structure before writing component docs.
- [ ] Seed the taxonomy into production once, after the database update.
- [ ] Human review: confirm the plan is finalized.

## Notes

- The product previously rejected AI auto-creating gaps; confirm any content generation stays learner-triggered, not automatic.
- Releasing the next batch of topics only covers courses on the learning list, and can still restore a topic the learner dropped.
- Topics release after every answer; an engaged learner could hit the cap in one sitting. Pacing releases over time is still undecided.
- The system doesn't yet record which source a topic came from; it currently infers this through the course and learning-list link.
