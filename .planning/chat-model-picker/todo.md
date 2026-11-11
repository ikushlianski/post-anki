# Chat model picker

## chat-model-switch

### Scope
- Every chat (card, subject, study, queue) shows the AI model in use and lets you switch it from inside the chat.
- Out of scope: Adding new model providers.

### Goal
- A chat's model can be changed from inside the chat itself.

### Criteria
- [ ] The chat header shows the current model name
- [x] Picking another model applies to the next reply
- [x] The choice is remembered for later chats
- [x] Only models allowed in admin settings are offered

### Coding tasks
- [x] Let chat requests carry a chosen model id, checked against the allowed models list.
- [x] Add a model picker to the web chat header that remembers the last choice.
- [x] Add the same chat model picker to the Mac and iPhone chat screens.

### Notes
- Owns apps/api/src chat controllers and services, apps/web/src chat folders and the apple chat screens.

