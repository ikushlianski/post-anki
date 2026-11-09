const MOVABLE_APPROVAL_STATES: ReadonlySet<string> = new Set(["pending", "approved", "inbox", "chat"]);

export function isMovableApprovalState(approvalState: string): boolean {
  return MOVABLE_APPROVAL_STATES.has(approvalState);
}
