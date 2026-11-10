export interface CardModelBackfillArgs {
  apply: boolean;
  allowRemote: boolean;
  fromFeedback: boolean;
}

export interface CardModelBackfillCandidate {
  bitId: string;
  fusionModelIds: string[];
  sourceModelId: string | null;
  feedbackModelId: string | null;
}

export interface CardModelBackfillPlan {
  reliable: Map<string, string[]>;
  inferred: Map<string, string[]>;
  skipped: number;
}

export function parseCardModelBackfillArgs(argv: readonly string[]): CardModelBackfillArgs {
  return {
    apply: argv.includes("--apply"),
    allowRemote: argv.includes("--allow-remote"),
    fromFeedback: argv.includes("--from-feedback"),
  };
}

export function reliableModelFor(candidate: CardModelBackfillCandidate): string | null {
  if (candidate.fusionModelIds.length === 1) {
    return candidate.fusionModelIds[0] ?? null;
  }

  if (candidate.fusionModelIds.length === 0) {
    return candidate.sourceModelId;
  }

  return null;
}

function addTo(map: Map<string, string[]>, modelId: string, bitId: string): void {
  map.set(modelId, [...(map.get(modelId) ?? []), bitId]);
}

export function planCardModelBackfill(candidates: readonly CardModelBackfillCandidate[]): CardModelBackfillPlan {
  const plan: CardModelBackfillPlan = { reliable: new Map(), inferred: new Map(), skipped: 0 };

  for (const candidate of candidates) {
    const reliable = reliableModelFor(candidate);

    if (reliable) {
      addTo(plan.reliable, reliable, candidate.bitId);
    } else if (candidate.fusionModelIds.length === 0 && candidate.feedbackModelId) {
      addTo(plan.inferred, candidate.feedbackModelId, candidate.bitId);
    } else {
      plan.skipped += 1;
    }
  }

  return plan;
}

export function countBits(groups: ReadonlyMap<string, readonly string[]>): number {
  return [...groups.values()].reduce((total, ids) => total + ids.length, 0);
}
