No confirmed scenarios, built from plan.md. Nothing was run against live data or on a device; only the simulator build was checked.

## Environment
- Run `xcodegen generate`, open PostAnkiIOS.xcodeproj, run the PostAnkiIOS scheme on an iPhone simulator, iOS 17+.
- Run the post-anki API locally with some practice history, set the server address and token in Settings, and keep the web app open for comparison.

## Steps
1. Home: expect the streak and today's counts at the top, matching the web dashboard.
2. Progress tab: expect milestones, retention (as a percent) and the weekly digest, matching the web analytics page. Ingest and Inbox now sit under More.
3. Open a course with practice: expect weak spots and strong points, and See all stats opening the full stats screen.
4. Airplane mode, pull to refresh: expect the offline message and the old numbers kept.
5. Clear the token: expect the Settings hint instead of numbers.
