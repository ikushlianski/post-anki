export interface ActionFailureContext {
  actionName?: string
  missingTestId?: string
  expectedStatus?: string
  actualStatus?: string
  url?: string
  reason?: string
}

export class ActionFailure extends Error {
  readonly name = 'ActionFailure'
  readonly context: ActionFailureContext

  constructor(message: string, context: ActionFailureContext = {}) {
    super(message)
    this.context = context
  }

  static missingTestId(testId: string, actionName?: string): ActionFailure {
    return new ActionFailure(
      `missing data-testid="${testId}" (action: ${actionName ?? 'unknown'})`,
      { actionName, missingTestId: testId },
    )
  }

  static statusTimeout(
    expected: string,
    actual: string,
    actionName?: string,
  ): ActionFailure {
    return new ActionFailure(
      `status transition timed out: expected "${expected}", last observed "${actual}" (action: ${actionName ?? 'unknown'})`,
      { actionName, expectedStatus: expected, actualStatus: actual },
    )
  }

  static fromMessage(reason: string, actionName?: string): ActionFailure {
    return new ActionFailure(`${reason} (action: ${actionName ?? 'unknown'})`, {
      actionName,
      reason,
    })
  }
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return value instanceof ActionFailure
}
