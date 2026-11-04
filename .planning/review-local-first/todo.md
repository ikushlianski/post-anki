# Review local-first
## review-prefetch

### Scope
- The iPhone review keeps a sliding window of upcoming cards on the phone so moving between cards is instant.
- Out of scope: Full offline mode and making the whole app work without a connection.

### Goal
- Moving from one review card to the next is instant because the next cards are already on the phone, while answers still sync to the server in the background.

### Coding tasks
- [x] Send each answer to the server in the background and keep it queued if the connection fails, so the review feels local while the server stays the source of truth.
- [x] Keep at least the next 20 review cards downloaded ahead of time and top the window up in the background as the owner nears its end, so card transitions never wait on the network.

### Notes


