# [Initiative] Ecosystem Awareness

**Priority:** lowest
**Phase:** 3 (build last, only if user is actively engaged)

## What this unlocks for the user

A weekly Telegram digest of what changed in the user's specific stack this week —
GA releases only, no betas. When an update contradicts an existing concept, the
system flags it and suggests a re-discussion.

The user stays current on their ecosystem without having to monitor GitHub releases,
blogs, or newsletters manually.

## Phase gate

Requires:
- Gap tracking and concept model both working (Phase 1b)
- User has been engaged for 8+ weeks
- Concept data exists so the system knows what might be affected by updates

## Risk

This is the feature most likely to become noise. Weekly digests are only valuable
if they are highly filtered to the user's actual stack. If poorly calibrated,
this becomes another source of overwhelm — the opposite of what we want.
Build with extreme conservatism: start with just 3-5 tools the user specifies,
and GA-only, no exceptions.

## Depends on

[Initiative] Daily Architect Mentor (concept data)
[Initiative] Knowledge Gap Map (to flag which concepts are affected by updates)

## Enables

Nothing.

## Epics within this initiative

1. [Epic] Weekly ecosystem digest for user's stack
