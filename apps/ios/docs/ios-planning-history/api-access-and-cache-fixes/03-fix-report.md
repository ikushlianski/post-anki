# 03 fix report: ExerciseScreen

Changes (Sources/PostAnkiIOS/ExerciseScreen.swift, staged):
- start() is now synchronous: if startTask is set it returns; otherwise sets isLoading = true immediately and creates an unstructured Task (flush, empty-topics check, loadCurrentTopic). The view's .task no longer awaits it, so view cancellation cannot affect it. This removes the "Nothing left to practice" flash during flush and the stuck-after-reappear case.
- hasStarted and the Task.isCancelled check are removed. loadWasCancelled is kept only so a cancelled request (CancellationError / URLError.cancelled) clears startTask, letting a later appearance start again; Offline banner behaviour unchanged.
- submitAnswer() has an isSubmitting guard (defer reset), same style as isAdvancing.
- retry() returns early if isLoading.
- Call site changed to `.task { model.start() }`.

Build: xcodebuild ... build CODE_SIGNING_ALLOWED=NO, exit code 0, no warnings or errors in output.
Not run live: offline, cancellation, double-tap paths.

Defaults taken:
- start() made non-async (no await needed) and call site updated.
- Empty-topics case resets isLoading to false before setting finished.
- Task captures self weakly.

END-OF-REPORT
