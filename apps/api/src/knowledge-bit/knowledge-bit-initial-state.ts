export type InitialBitState =
  | { approvalState: "pending" }
  | { approvalState: "approved"; decidedAt: Date };

export function initialBitState(triageEnabled: boolean, now: Date = new Date()): InitialBitState {
  return triageEnabled ? { approvalState: "pending" } : { approvalState: "approved", decidedAt: now };
}
