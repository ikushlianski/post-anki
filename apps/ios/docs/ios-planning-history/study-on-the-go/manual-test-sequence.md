No confirmed scenarios, built from the brief. Written by hand: the wrap-up helper returned no dispatch target for this light run.

Covers: Home "Study now" button, offline answer queue. Not covered: the offline question cache (stalled in review, see todo.md "To review / clarify").

## Environment
- Open PostAnkiIOS.xcodeproj in Xcode and run the PostAnkiIOS scheme on an iPhone simulator (iOS 17+).
- The app reads its API base URL from the `apiBaseURL` UserDefaults key, default https://api.postanki.ilya.online (prod API is not deployed). Point it at a locally running post-anki API, or expect network errors.

## Sequence
1. Courses tab: open any course so it becomes the last-studied course. Go to Home. Expect a "Continue studying" card with a prominent "Study now" button; it stays disabled until the course has loaded and has topics.
2. Tap "Study now". Expect the Exercise screen with the first question for the course's first topic.
3. Switch the simulator to airplane mode (or stop the API). Type an answer, tap Submit. Expect "Saved. It will be graded when you're back online." with a Next button and no score or verdict.
4. Tap Next and answer two more questions offline. Expect each to be saved the same way.
5. Restore the connection, then background and foreground the app. Expect the saved answers to be sent for grading (check the API logs for three answer requests, one per question, no duplicates).
6. Repeat step 3 and kill the app before restoring the connection. Relaunch, open Study now. Expect the saved answers to be sent once the exercise screen loads.

## Data gap check
- Live grading of replayed answers cannot be seen in the app: replayed results are not shown to the learner. Verify through API logs or the database.
- Prod API is not deployed, so nothing here was exercised against real data.
