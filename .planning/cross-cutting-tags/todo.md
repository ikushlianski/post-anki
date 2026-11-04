# Cross-cutting tags for cards
## cross-cutting-tags

### Scope
- Let a card carry a few labels for concerns that cut across subjects, such as performance and security.
- Keep the label set small and fixed so it does not bloat the app.
- Out of scope: Replacing subjects, and free-form tags typed by the owner.

### Goal
- The owner can study every card on one cross-cutting concern, for example all security cards, whichever subject they sit in.

### Coding tasks
- [ ] When a card is created, let the cheap classifier pick its labels from the fixed set; if none fits or its confidence is low, send those cards in one batch to a more capable but still cheap model. The owner can confirm or change the labels in Triage.
  - Priority: low
- [ ] Choose a small fixed starting set of cross-cutting labels (for example performance, security, reliability) and store them on cards.
  - Priority: low
- [ ] Let the owner filter Knowledge, Triage and Review by one label so a session can cover, say, only security cards across all subjects.
  - Priority: low

### Notes


