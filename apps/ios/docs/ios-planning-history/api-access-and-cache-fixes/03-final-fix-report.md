# 03 final fix report

File changed (staged): Sources/PostAnkiIOS/ExerciseScreen.swift

1. isLoading defaults to true; empty state now requires `finished`. Verified `finished` is set on the empty-topics path and (via the guard) when no next topic remains; failure paths set errorMessage instead.
2. Added centered ProgressView branch for `isLoading` with no current question, before the error and empty-state branches.
3. Cancelled loads (CancellationError and URLError.cancelled) set errorMessage "Loading was interrupted." so Try again shows; startTask still cleared.
4. submitAnswer: URLError.cancelled is caught first and returns without enqueueing or offline text.
5. loadCurrentTopic guard clears isLoading and sets finished.
6. isSubmitting is private(set); Submit button also disabled while submitting.

Build exit code: 0
Offline and cancellation paths were not run live.

Defaults: error branch now shows whenever not loading and errorMessage is set (unchanged logic); spinner uses maxWidth/maxHeight infinity frame.

END-OF-REPORT
