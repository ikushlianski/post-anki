import { LevelChip } from '../gamification/level-chip'
import { AnkiReviewScreen } from '../knowledge-bit/anki-review-screen'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'

export function HomeSubjectsAndReview() {
  return (
    <section
      data-testid="home-subjects-and-review"
      className="mx-auto max-w-7xl px-5 pt-8 sm:px-8"
    >
      <div data-testid="home-left" className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Post Anki</h1>
          <AddKnowledgeButton />
        </div>
        <LevelChip />
        <div data-testid="home-review">
          <AnkiReviewScreen scope={{}} />
        </div>
      </div>
    </section>
  )
}
