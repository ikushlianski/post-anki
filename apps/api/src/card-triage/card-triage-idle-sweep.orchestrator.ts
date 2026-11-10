import { log } from "../shared/log.js";
import { distillTriageSession } from "./card-triage-distill.orchestrator.js";
import { finishTriageSession, listIdleOpenTriageSessionIds } from "./card-triage-session.repo.js";

export const TRIAGE_IDLE_AFTER_MS = 24 * 60 * 60 * 1000;
export const TRIAGE_IDLE_SWEEP_LIMIT = 20;

export interface IdleSweepDeps {
  listIdle: (olderThan: Date, limit: number) => Promise<string[]>;
  finish: (id: string) => Promise<unknown>;
  distill: (id: string) => Promise<unknown>;
}

export interface IdleSweepResult {
  closed: number;
  failed: number;
}

function defaultDeps(): IdleSweepDeps {
  return {
    listIdle: listIdleOpenTriageSessionIds,
    finish: (id) => finishTriageSession(id, {}),
    distill: (id) => distillTriageSession(id),
  };
}

export async function sweepIdleTriageSessions(
  now: Date = new Date(),
  deps: IdleSweepDeps = defaultDeps(),
): Promise<IdleSweepResult> {
  const ids = await deps.listIdle(new Date(now.getTime() - TRIAGE_IDLE_AFTER_MS), TRIAGE_IDLE_SWEEP_LIMIT);
  let closed = 0;
  let failed = 0;

  for (const id of ids) {
    try {
      await deps.finish(id);
      await deps.distill(id);
      closed += 1;
    } catch (err) {
      failed += 1;
      log.warn({ sessionId: id, errorName: err instanceof Error ? err.name : "unknown" }, "card_triage_idle_sweep_failed");
    }
  }

  return { closed, failed };
}
