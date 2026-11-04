# Automatic subject for new cards
## subject-assignment

### Scope
- Pick a subject for every card created from ingested knowledge, using the existing subject list.
- Escalate only the low-confidence cards, as one batch, to a stronger but still cheap model.
- Out of scope: Creating new subjects and any change to the interactive Add-screen subject check.

### Goal
- Newly created cards land under a fitting subject without the owner choosing, and few cards need the stronger model.

### Coding tasks
- [x] Show the suggested subject on the card in Triage so the owner can accept or change it, and never auto-create a subject.
- [x] Collect the cards whose subject confidence is low and send them in one batch to a more capable but still cheap model, which suggests a subject from the existing subject list. Cards with high confidence skip this step so cost stays small.
- [x] Find out how a subject is chosen today when ingested knowledge becomes cards, and whether the existing cheap classifier already reports a confidence for it.

### Notes


