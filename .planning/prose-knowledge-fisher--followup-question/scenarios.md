# Scenarios — follow-up question after grading

- [ ] A correct (Ok-verdict) answer still gets a follow-up question that pushes one level deeper into the reasoning, not a repeat of the original question
- [ ] An incomplete/wrong answer (NeedsReview/NeedsDeepDive) gets a follow-up that targets the specific gap named in the grader's feedback
- [ ] Grading an answer for a variant id that doesn't exist returns 404 and never calls the follow-up generator
- [ ] The HTTP response from POST /knowledge-bits/question-variants/:id/answers includes a non-empty `followUpQuestion` alongside score/verdict/feedback
