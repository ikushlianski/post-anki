No confirmed scenarios, built from the plan. Nothing here was run against a server.

## Environment
- Local post-anki API with a token in Settings; simulator iOS 17+.

## Steps
1. Courses tab > Organise > New course. Expect subject picker, name, description, a mode picker.
2. Pick "Research a topic", fill name and topic, Create. Expect the build screen with "Gathering sources...".
3. Wait. Expect the screen to move to source approval on its own. Remove one source (confirm dialog), add a link, tap "Approve sources".
4. If none can be used, expect "None of these sources can be used." and "Continue without sources".
5. In the structure step send two change requests. Expect your message right, the assistant left, and the outline updating. If research candidates appear, select some and tap "Use selected", or "Skip these".
6. Tap "Confirm structure". Expect topic toggles; switch some off, tap "Include all", then "Confirm course". With none included expect "Include at least one topic."
7. Tap "Open course" and see it on the Courses tab.
8. New course with "Links": two links, Create. Approve its sources.
9. "Courses being built": expect unfinished courses with a status; open one.
10. Force a failure if possible. Expect "Building this course failed." and "Try again".
11. Leave the build screen mid-gathering and return. Expect state reloaded and no duplicate polling.
