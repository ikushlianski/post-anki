# Scenarios — answer-screen

- [ ] The next-batch endpoint returns variants with zero attempts before ones already answered.
- [ ] The next-batch endpoint, given a tagId, only returns variants whose bit carries that tag.
- [ ] The next-batch endpoint returns an empty array (not an error) once every variant has been
  seen at least once in the same relative ordering pass.
- [ ] Submitting an answer on the screen shows the real verdict/feedback/follow-up question
  returned by the existing grading endpoint, not a generic success message.
- [ ] After answering, the screen advances to the next question in the batch without a full page
  reload.
- [ ] The tags page's existing strength badge for a tag links into this screen scoped to that tag.
