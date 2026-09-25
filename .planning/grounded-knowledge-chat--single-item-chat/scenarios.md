# Scenarios: chat scoped to a single knowledge item

- [ ] Learner asks a question about an existing bit and gets a reply grounded on that bit's body
- [ ] A passed-in transcript is included in the prompt so the reply accounts for prior turns
- [ ] Chatting against a bit id that doesn't exist returns 404 `{"error":"not_found"}`
- [ ] An empty message is rejected with a validation error, not sent to the model
- [ ] The agent's own instructions forbid answering from outside the bit's own content
- [ ] `POST /knowledge-bits/:id/chat` resolves to the new handler via the router
