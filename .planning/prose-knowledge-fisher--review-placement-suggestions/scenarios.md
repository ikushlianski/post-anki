---
type: scenarios
item: review-placement-suggestions
---

# Scenarios

- [ ] Listing pending suggestions returns only bits with a suggestion, no topic, and no resolution
      timestamp — a matched, failed, or already-resolved bit never appears.
- [ ] Accepting a suggestion with a valid `moduleId` creates a real topic under that module, sets
      the bit's `topicId` to it, and stamps `placementSuggestionResolvedAt`.
- [ ] Accepting with a `moduleId` that doesn't resolve to a real module returns `module_not_found`
      and leaves the bit claimable again (resolution timestamp rolled back, not left half-set).
- [ ] Rejecting a suggestion stamps `placementSuggestionResolvedAt` and leaves `topicId` null —
      the bit is terminally unplaced, same as a `placementFailedAt` bit.
- [ ] A second accept/reject call on an already-resolved bit returns `already_resolved` (409), never
      double-creates a topic or double-stamps the timestamp.
- [ ] A call against a bit id that doesn't exist returns `not_found` (404).
- [ ] The admin panel removes a suggestion from its list on any resolution outcome, including
      `already_resolved` from a concurrent tab/double-click.
- [ ] Accepting shows a confirmation naming the new topic and its module; rejecting shows none.
