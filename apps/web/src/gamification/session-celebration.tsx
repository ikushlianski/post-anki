export function SessionCelebration({
  pointsEarned,
  leveledUp,
  level,
}: {
  pointsEarned: number
  leveledUp: boolean
  level: number | null
}) {
  if (pointsEarned <= 0) {
    return null
  }

  return (
    <div
      role="status"
      data-testid="session-celebration"
      className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4"
    >
      <p className="text-lg font-medium text-neutral-900">+{pointsEarned} points this session</p>
      {leveledUp && (
        <p data-testid="session-celebration-level" className="mt-1 text-sm text-neutral-700">
          {level ? `Level ${level} reached` : 'New level reached'}
        </p>
      )}
    </div>
  )
}
