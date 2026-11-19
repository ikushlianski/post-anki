# Manual test: in-progress features batch

Needs API deploy (migrations 0165, 0166, 0167) and reinstalled apps. Voice and share need a real device.

1. Subject suggestions: run a scan, list pending, approve one (whole source note gets the subject), reject one.
2. MCP: submit knowledge with sourceKind and origin; list_knowledge_sources shows origin.
3. Web offline review: load review, go offline, grade 3 cards (indicator "Offline: 3 grades waiting"), reconnect, grades send once.
4. Share card: web (share sheet or clipboard), iPhone and Mac ShareLink: text is Q:/A: only, no hints, ids or notes.
5. Personal note: add a note in review, see it again in card detail on web and apps.
6. "I know this" side button on iPhone and Mac: marks known, does not cover card text on a small phone.
7. Show card ids toggle in Settings: off hides, on shows copy-id button.
8. Move to deck during review (web, iPhone, Mac): recent 5 first, search, next card appears, nothing graded; offline shows "needs a connection".
9. Optimistic grading: grade, next card shows at once; force a server rejection and see "Couldn't save that grade. Try again."
10. Bury, suspend, mark known, edit: next card shows at once; failure restores the card with a message.
11. Highlight to card: web select text in revealed answer, "Make card"; apps use "Make card from selection" sheet. Card appears pending for approval.
12. Voice: mic dictates into the box without sending; "Read replies aloud" speaks a finished reply, Stop works, stops on send. First use asks mic and speech permission. Try Chrome, iPhone, Mac.
