import { LevelChip } from '../gamification/level-chip'
import { GoalProgressChip } from '../motivation/goal-progress-chip'
import { AddKnowledgeButton } from '../knowledge-source/add-knowledge-button'

export function HomeHeader() {
  return (
    <header data-testid="home-header" className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Post Anki</h1>
        <AddKnowledgeButton />
      </div>
      <GoalProgressChip />
      <LevelChip />
    </header>
  )
}
