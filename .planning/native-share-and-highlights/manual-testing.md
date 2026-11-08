# Manual testing: native highlights and Mac share extension

## Highlights (Mac and iPhone, Add knowledge screen)
1. Paste a few paragraphs, select a phrase, tap "Highlight selection": it turns yellow. Remove one mark, then Clear.
2. Mark 20 phrases: further marks are ignored. Edit text before a mark: the mark moves with it.
3. Type with a Japanese or Chinese input method while marks exist: the half-typed word must not disappear.
4. Save with a subject, open the source and generate cards: questions should focus on marked parts.

## Share extension (needs signing steps in .planning/.runs/2026-11-07/native-share-ext/report.md)
1. After signing and enabling in System Settings > Extensions > Sharing, select text in the Claude desktop app, right-click > Share > Post Anki.
2. Panel shows the text, subject picker with Auto first. Save with Auto: item appears in the Knowledge Inbox and triage assigns a subject.
3. Pick a subject and save: item lands in that subject. Sign out of the app and share: panel says to sign in.
