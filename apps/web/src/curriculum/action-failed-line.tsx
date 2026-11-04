import { ACTION_FAILED_MESSAGE } from './use-guarded-run'

export function ActionFailedLine({ failed, testId }: { failed: boolean; testId?: string }) {
  if (!failed) {
    return null
  }

  return (
    <span role="alert" data-testid={testId} className="text-xs text-red-600">
      {ACTION_FAILED_MESSAGE}
    </span>
  )
}
