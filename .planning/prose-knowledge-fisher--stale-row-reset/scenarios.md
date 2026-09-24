# Scenarios — stale-processing-row reset

- [ ] A source in `processing` for longer than the threshold is reset to `pending` on the next scan
- [ ] A source in `processing` for less than the threshold is left untouched (not prematurely reclaimed)
- [ ] A `pending` or `bits_detected` or `failed` source is never touched by the reset, regardless of `updatedAt`
- [ ] Claiming, failing, and succeeding a source each update its `updatedAt`
- [ ] A reset source is claimable again on the very next `claimPendingKnowledgeSources` call
- [ ] Running the reset when nothing is stale is a no-op (0 rows affected, no error)
