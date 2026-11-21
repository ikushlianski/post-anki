## a-shuffle-option-for-today-s-review-mixe

### Scope
- Priority: medium
- A Shuffle option for today's review mixes new and due cards in random order.

### Coding tasks
- [ ] Add a shuffle_review boolean column, default false, to the admin settings schema with a migration.
- [ ] Add shuffleReview to the shared admin-settings schemas and to the admin settings repo read and update.
- [ ] Add a shuffleCards helper with an injectable random source to knowledge-bit-review-queue-mix.ts, with tests.

### Notes
- goal run run-20261116t231447z

## the-today-button-groups-today-s-cards-by

### Scope
- Priority: medium
- The Today button groups today's cards by subject, shows the current subject, and announces the next subject with how many cards remain.

### Coding tasks
- [ ] Group buildReviewPack cards with groupReviewCardsBySubject and loadSubjectPathLabels, attaching subjectPath to each card.
- [ ] In knowledge-bit-review-pack.service.test.ts, assert pack cards are grouped by subject and carry subjectPath.
- [ ] Add review-pack-store smoke test: offline 'all' scope cards keep subjectPath and server order.

### Notes
- goal run run-20261116t231652z

## every-review-card-shows-the-subject-it-b

### Scope
- Priority: medium
- Every review card shows the subject it belongs to.

### Coding tasks
- [ ] Add nullable optional subjectPath to reviewCardSchema in packages/shared knowledge-bit-review.ts.
- [ ] Render subjectPath above the question in anki-review-card.tsx, kept visible after reveal.
- [ ] Test anki-review-card shows subjectPath, and hides the label when subjectPath is null.

### Notes
- goal run run-20261116t231930z
