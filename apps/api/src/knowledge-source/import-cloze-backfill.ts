export const IMPORT_BACKFILL_DEFAULT_LIMIT = 25;

export interface ImportBackfillArgs {
  apply: boolean;
  allowRemote: boolean;
  limit: number;
}

export function parseImportBackfillArgs(argv: readonly string[]): ImportBackfillArgs {
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex === -1 ? IMPORT_BACKFILL_DEFAULT_LIMIT : Number(argv[limitIndex + 1]);

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("--limit needs a positive whole number");
  }

  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    limit,
  };
}

export interface RebuildResult {
  status: string;
  inserted: number;
  failureReason?: string | null;
}

export interface RebuildClaim {
  sourceId: string;
  supersededIds: readonly string[];
  supersededCount: number;
}

export interface RebuildSettlement {
  kept: boolean;
  retired: number;
  line: string;
}

// The claim retires the source's pending cards first; they stay retired only if regeneration wrote a new card.
export async function settleRebuiltSource(
  claim: RebuildClaim,
  result: RebuildResult,
  restoreCards: (sourceId: string, bitIds: readonly string[]) => Promise<number>,
): Promise<RebuildSettlement> {
  const reason = result.failureReason ? `, reason=${result.failureReason}` : "";
  const head = `  ${claim.sourceId}: ${result.status}, inserted ${result.inserted}`;

  if (result.inserted > 0) {
    return { kept: false, retired: claim.supersededCount, line: `${head}, retired ${claim.supersededCount}${reason}` };
  }

  const restored = await restoreCards(claim.sourceId, claim.supersededIds);

  return { kept: true, retired: 0, line: `${head}, kept ${restored} old card(s) pending${reason}` };
}
