import { type AdvisoryLockResult, withAdvisoryLock } from "../db/advisory-lock.js";

export const MINING_RUN_LOCK_KEY = "7301552001";

export type MiningLockResult<T> = AdvisoryLockResult<T>;

export function withMiningRunLock<T>(run: () => Promise<T>): Promise<MiningLockResult<T>> {
  return withAdvisoryLock(MINING_RUN_LOCK_KEY, run, "card_synthesis_mining_unlock_failed");
}
