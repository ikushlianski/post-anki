# Scenarios — place-knowledge-bits

- [ ] A bit whose content clearly fits a real, `included=true`, non-container topic gets
      `topicId` set to that topic's id and `placementCheckedAt` set; `placementSuggestion` stays null.
- [ ] A bit with no real topic fit gets `placementSuggestion` set to the agent's one-sentence
      suggestion and `placementCheckedAt` set; `topicId` stays null.
- [ ] A placer response naming a `matchedTopicId` NOT present in the topic list sent this call is
      treated as invalid: falls back to `suggestedPlacement` when present, else marks the bit failed.
- [ ] A bit whose placer call throws is marked `placementFailedAt` and does not stop the batch —
      the next bit in the scan still gets processed.
- [ ] The selection query only returns bits with both `placementCheckedAt` and `placementFailedAt`
      null — a bit already matched, already suggested, or already failed is never rescanned.
- [ ] The filtered topic-listing function excludes `included=false` topics and topics under a
      container curriculum (`containerAreaNodeId IS NOT NULL`).
- [ ] The scan is capped at `PLACEMENT_CAP` bits per call; remainder bits are left for the next scan.
- [ ] `POST /knowledge-bits/placement-scan` returns the scan's `{scanned, matched, suggested,
      failed}` counts through the same route/auth shape as the existing tagging-scan route.
