import type { PathStepStatus } from "./path-progress";

export interface OrderedPathStep {
  domainNodeId: string;
  status: PathStepStatus;
}

export function nextPathStep(steps: OrderedPathStep[]): string | null {
  const next = steps.find((step) => step.status !== "done");

  return next ? next.domainNodeId : null;
}
