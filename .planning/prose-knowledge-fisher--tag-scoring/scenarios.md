# Scenarios — score each answer against its bit's tags

- [ ] Grading a variant whose bit has tags returns those tag ids alongside score/verdict/feedback
- [ ] Grading a variant whose bit has no tags yet returns an empty tagIds array, not an error
- [ ] Grading a variant id that doesn't exist returns 404 and never attempts a tag lookup
- [ ] The HTTP response from POST /knowledge-bits/question-variants/:id/answers includes tagIds
