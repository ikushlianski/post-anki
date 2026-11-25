# post-anki

## Optimistic by default
- Every user action that saves to the server updates the screen immediately and sends the request in the background. Never make the user wait on the network to see their own change.
- On failure, roll the screen back to the previous state and say plainly that it couldn't be saved. Never leave a failure silent.
- Wait for the server only when the result cannot be known beforehand (for example a newly created record's id) or the action is destructive and irreversible.
