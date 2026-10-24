import { useEffect, useState } from 'react'

import { AnkiReviewScreen } from '../knowledge-bit/anki-review-screen'
import { KnowledgeBrowserSubjectList } from '../knowledge-bit/knowledge-browser-subject-list'
import { HomeOptions } from './home-options'

export function HomeSubjectsAndReview() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <section
      data-testid="home-subjects-and-review"
      className="mx-auto grid max-w-7xl gap-8 px-5 pt-8 sm:px-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
    >
      <div data-testid="home-left" className="min-w-0">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight text-neutral-900">Post Anki</h1>
        <HomeOptions />
        <div data-testid="home-review">
          <AnkiReviewScreen scope={{}} />
        </div>
      </div>
      <aside data-testid="home-subjects" className="min-w-0">
        <h2 className="mb-3 text-lg font-semibold text-neutral-900">Subjects</h2>
        {mounted && <KnowledgeBrowserSubjectList />}
      </aside>
    </section>
  )
}
