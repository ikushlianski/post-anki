# 03 cache fixes report

## Changes (Sources/PostAnkiIOS/ExerciseScreen.swift)
1. start() runs once per model (hasStarted). If cancelled during flush or mid-load, the flag resets so the next appearance loads. A finished load keeps the flag set, so reappearing does nothing. retry() calls loadCurrentTopic directly and is unaffected.
2. loadCurrentTopic: CancellationError and URLError.cancelled set loadWasCancelled, then it stops quietly (isLoading false). No offline flag, no cache replacement, no error, no advanceTopic. Other URLErrors keep the offline behaviour.
3. nextBit returns unless feedback != nil and no advance is in flight (isAdvancing, reset via defer).

## Build
xcodebuild ... build: exit code 0

## Not exercised
Offline, cancellation and double-tap paths were not run live; build only.

## Numstat
git diff b4ceee06c6104113de9741aa95778bd330317036 --numstat -- Sources
29	0	Sources/PostAnkiIOS/ExerciseScreen.swift

## Defaults
- A "Saved. It will be graded..." offline message counts as feedback, so Next works after it.
- A retry() after a cancelled load does not touch hasStarted.
- Cancellation during PendingAnswerQueue flush is detected with Task.isCancelled.

END-OF-REPORT
