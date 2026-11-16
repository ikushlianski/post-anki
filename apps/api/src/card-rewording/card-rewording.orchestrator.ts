import type { Db } from "../db/client.js";
import { listDifficultPlainCards } from "../knowledge-bit/knowledge-bit-card-difficulty.repo.js";
import { runCardRewording } from "../mastra/card-rewording.agent.js";
import { log } from "../shared/log.js";
import { CARD_REWORDING_MODEL_ID } from "./card-rewording.config.js";
import { bitIdsWithAnyDraft, insertRewordedDrafts, recordRewordingFailure } from "./card-rewording.repo.js";
import { validateRewordedVersions } from "./card-rewording.validate.js";

export const CARD_REWORDING_DEFAULT_LIMIT = 10;
const CANDIDATE_POOL = 200;

export interface CardRewordingScanResult {
  considered: number;
  skippedWithDrafts: number;
  reworded: number;
  failed: number;
  versionsStored: number;
}

export async function runCardRewordingScan(
  db: Db,
  options: { limit?: number; dryRun?: boolean } = {},
): Promise<CardRewordingScanResult> {
  const limit = options.limit ?? CARD_REWORDING_DEFAULT_LIMIT;
  const result: CardRewordingScanResult = {
    considered: 0,
    skippedWithDrafts: 0,
    reworded: 0,
    failed: 0,
    versionsStored: 0,
  };
  const candidates = await listDifficultPlainCards(db, { limit: Math.max(limit, CANDIDATE_POOL) });
  const withDrafts = await bitIdsWithAnyDraft(
    db,
    candidates.map((card) => card.bitId),
  );
  const fresh = candidates.filter((card) => !withDrafts.has(card.bitId));

  result.skippedWithDrafts = candidates.length - fresh.length;

  for (const card of fresh.slice(0, limit)) {
    result.considered += 1;

    try {
      const output = await runCardRewording({ front: card.front, back: card.back }, card.bitId);
      const versions = validateRewordedVersions(card, output.versions);

      if (versions.length === 0) {
        result.failed += 1;
        await rememberFailure(db, card.bitId, options.dryRun);
        continue;
      }

      result.reworded += 1;

      if (options.dryRun) {
        result.versionsStored += versions.length;
        log.info({ bitId: card.bitId, versions }, "card_rewording_dry_run");
        continue;
      }

      result.versionsStored += await insertRewordedDrafts(
        db,
        versions.map((version) => ({
          knowledgeBitId: card.bitId,
          prompt: version.prompt,
          answer: card.back,
          angle: version.angle,
          modelId: CARD_REWORDING_MODEL_ID,
        })),
      );
    } catch (err) {
      result.failed += 1;
      log.warn({ err, bitId: card.bitId }, "card_rewording_card_failed");
      await rememberFailure(db, card.bitId, options.dryRun).catch((recordErr: unknown) =>
        log.warn({ err: recordErr, bitId: card.bitId }, "card_rewording_failure_not_recorded"),
      );
    }
  }

  return result;
}

async function rememberFailure(db: Db, bitId: string, dryRun: boolean | undefined): Promise<void> {
  if (dryRun) {
    return;
  }

  await recordRewordingFailure(db, bitId, CARD_REWORDING_MODEL_ID);
}
