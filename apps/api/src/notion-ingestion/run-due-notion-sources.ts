import type { NotionRunResult } from "@post-anki/shared";
import { log } from "../shared/log.js";
import {
  claimDueNotionSource,
  listDueNotionSources,
  restoreNextRunAt,
  settleNextRunAt,
  type ClaimedNotionSource,
} from "./notion-source-due.repo.js";
import type { NotionPageGateway } from "./notion-page.gateway.js";
import { runNotionSource } from "./run-notion-source.js";

export const TICK_WALL_TIME_MS = 240_000;

export interface DueRunReport {
  sourceId: string;
  status: NotionRunResult["status"] | "already_running" | "source_missing";
  result: NotionRunResult | null;
}

async function runClaimed(
  claimed: ClaimedNotionSource,
  gateway: NotionPageGateway,
  now: () => Date,
): Promise<DueRunReport> {
  const sourceId = claimed.source.id;
  let report: DueRunReport;

  try {
    const outcome = await runNotionSource(claimed.source, "scheduled", gateway, now);

    report =
      outcome.kind === "finished"
        ? { sourceId, status: outcome.result.status, result: outcome.result }
        : { sourceId, status: outcome.kind, result: null };
  } catch {
    log.error({ sourceId }, "notion_due_run_failed");
    report = { sourceId, status: "failed", result: null };
  }

  const keepDue = report.status === "skipped_budget" || report.status === "already_running";

  if (keepDue) {
    await restoreNextRunAt(claimed);
  } else {
    await settleNextRunAt(claimed, now());
  }

  return report;
}

export async function runDueNotionSources(
  gateway: NotionPageGateway,
  now: () => Date = () => new Date(),
  wallTimeMs: number = TICK_WALL_TIME_MS,
): Promise<DueRunReport[]> {
  const startedAt = now().getTime();
  const reports: DueRunReport[] = [];

  for (const candidate of await listDueNotionSources(now())) {
    if (now().getTime() - startedAt >= wallTimeMs) {
      break;
    }

    let report: DueRunReport;

    try {
      const claimed = await claimDueNotionSource(candidate, now());

      if (!claimed) {
        continue;
      }

      report = await runClaimed(claimed, gateway, now);
    } catch {
      log.error({ sourceId: candidate.id }, "notion_due_tick_source_failed");
      report = { sourceId: candidate.id, status: "failed", result: null };
    }

    reports.push(report);

    if (report.status === "skipped_budget") {
      break;
    }
  }

  return reports;
}
