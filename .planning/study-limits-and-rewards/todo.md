# Study limits and rewards
## study-limits

### Scope
- Daily study limits (new cards, reviews, per subject and overall), all adjustable by the owner.
- Rewards that grow as the owner studies more, building on the existing points and streak.
- Out of scope: Social or shared features.

### Goal
- The owner controls every daily study limit, and studying more earns visibly larger rewards.

### Coding tasks
- [x] Add a Learn ahead option that lets the owner review cards before they are due, for example the next day or two of upcoming cards, without changing the schedule of cards that are not yet due more than a normal answer would.
- [ ] Award bonus points for ingestion: adding new knowledge (a note, dictation or import) and approving cards from it earn points, with the amounts adjustable by the owner.
- [ ] Make the daily goal adapt to the owner: suggest a target from the recent average and raise it slowly, while the owner can always override the number.
- [ ] Show points, level, multiplier and today's progress live on the Review screen and in a Today overview on the iPhone.
- [ ] Add collectible badges for milestones such as the first 100 cards reviewed or a subject fully mastered, shown in a badge list.
- [ ] Extend streaks with milestones (for example 7, 30 and 100 days) and a streak freeze that protects one missed day.
- [ ] Add a combo multiplier so consecutive correct answers and consecutive study days multiply the points earned, with the multiplier rules adjustable by the owner.
- [ ] Give points and levels a clearer design: points per review add up to levels with visible thresholds, and the owner can see the current level and progress to the next.
- [ ] Store the limits on the server per subject and globally, let the review queue respect them, and expose them in the admin settings and on the iPhone.
- [ ] Decide the full set of daily limits (new cards, reviews, minutes, per subject and overall) and how they interact; write the choice down before building.
  - Why: Today only one global new-cards-per-day setting exists, so per-subject and nested limits have no agreed rules.
  - Decision: Which limits exist and which wins when a subject and its parent disagree.
  - Default: Per-subject limits for new cards and reviews, a subject inherits its parent's limit unless set, and the global limit is the ceiling.

### Notes


