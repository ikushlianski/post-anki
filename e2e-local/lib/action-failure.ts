// Ported from verification-repo's lib/actions/action-failure.ts (the shared
// `ActionFailure` type actions there throw for a missing testid or a status
// transition that never arrived). Copied rather than imported because
// e2e-local must never depend on verification-repo — this repo has to keep
// working even if that sibling repo is unavailable. Kept intentionally
// small; add cases here only if a real action needs them.
export interface ActionFailureContext {
  actionName?: string;
  missingTestId?: string;
  expectedStatus?: string;
  actualStatus?: string;
  reason?: string;
}

export class ActionFailure extends Error {
  readonly name = 'ActionFailure';
  readonly context: ActionFailureContext;

  constructor(message: string, context: ActionFailureContext = {}) {
    super(message);
    this.context = context;
  }

  static missingTestId(testId: string, actionName?: string): ActionFailure {
    return new ActionFailure(
      `missing data-testid="${testId}" (action: ${actionName ?? 'unknown'})`,
      { actionName, missingTestId: testId },
    );
  }

  static fromMessage(reason: string, actionName?: string): ActionFailure {
    return new ActionFailure(`${reason} (action: ${actionName ?? 'unknown'})`, {
      actionName,
      reason,
    });
  }
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return value instanceof ActionFailure;
}
