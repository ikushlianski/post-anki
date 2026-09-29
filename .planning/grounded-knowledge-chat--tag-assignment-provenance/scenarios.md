# Scenarios: tag-assignment provenance

- [ ] Editing a knowledge bit's body deletes its auto-tagger-assigned tags
- [ ] Editing a knowledge bit's body leaves a manually-assigned tag in place
- [ ] Manually assigning a tag that was already auto-assigned upgrades it to manual
- [ ] Manually assigning a brand-new tag inserts it as manual
- [ ] Auto-tagging a bit that already has a manual assignment for the same tag never downgrades it
- [ ] Auto-tagging inserts a new row as auto when no prior assignment exists
- [ ] Merging a tag whose source side had a manual assignment upgrades the surviving target-side row to manual
- [ ] Merging a tag with no manual assignment on either side keeps the target row's own source
- [ ] A pre-migration existing tag_assignments row defaults to source "manual" after the migration runs
