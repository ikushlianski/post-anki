export interface ReportedUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

interface UsageCounts {
  inputTokens?: number;
  outputTokens?: number;
}

interface ResultWithUsage {
  usage?: UsageCounts;
  totalUsage?: UsageCounts;
}

export function readGenerateUsage(result: ResultWithUsage): ReportedUsage {
  return {
    inputTokens: result.totalUsage?.inputTokens ?? result.usage?.inputTokens ?? null,
    outputTokens: result.totalUsage?.outputTokens ?? result.usage?.outputTokens ?? null,
  };
}
