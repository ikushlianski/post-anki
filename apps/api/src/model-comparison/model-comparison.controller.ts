import type http from "node:http";
import { z } from "zod";
import {
  MODEL_COMPARISON_RUN_LIST_LIMIT,
  compareModelsInput,
  gradeComparisonCardInput,
  gradeModelResultInput,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
} from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { estimateModelComparisonCost } from "./model-comparison-cost.js";
import {
  getComparisonRun,
  gradeComparisonCard,
  gradeModelResult,
  listComparisonRuns,
  saveComparisonRun,
} from "./model-comparison.repo.js";
import { runModelComparison } from "./model-comparison.runner.js";

const runIdSchema = z.string().uuid();
const cardIndexSchema = z.coerce.number().int().min(0).max(99);

function parseModelId(raw: string): KnowledgeItemModelId | null {
  try {
    const parsed = knowledgeItemModelIdSchema.safeParse(decodeURIComponent(raw));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// POST /admin/model-comparison/estimate
export async function handleEstimateModelComparison(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, compareModelsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, estimateModelComparisonCost(body.data.excerpt, body.data.modelIds));
}

// POST /admin/model-comparison/runs
export async function handleCreateModelComparisonRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, compareModelsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const estimate = estimateModelComparisonCost(body.data.excerpt, body.data.modelIds);

  if (!estimate.withinCap) {
    sendJson(res, 400, { error: "over_cost_cap", estimate });
    return;
  }

  const run = await runModelComparison(body.data);

  await saveComparisonRun({
    runId: run.runId,
    excerpt: body.data.excerpt,
    modelIds: body.data.modelIds,
    estimatedCostUsd: estimate.totalEstimatedCostUsd,
    perModelEstimatedCostUsd: Object.fromEntries(
      estimate.perModel.map((entry) => [entry.modelId, entry.estimatedCostUsd]),
    ),
    results: run.results,
  });

  sendJson(res, 201, await getComparisonRun(run.runId));
}

// GET /admin/model-comparison/runs
export async function handleListModelComparisonRuns(res: http.ServerResponse): Promise<void> {
  sendJson(res, 200, await listComparisonRuns(MODEL_COMPARISON_RUN_LIST_LIMIT));
}

// GET /admin/model-comparison/runs/:id
export async function handleGetModelComparisonRun(res: http.ServerResponse, runId: string): Promise<void> {
  if (!runIdSchema.safeParse(runId).success) {
    sendError(res, 404, "not_found");
    return;
  }

  const run = await getComparisonRun(runId);

  if (!run) {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, run);
}

// PATCH /admin/model-comparison/runs/:id/results/:modelId/grade
export async function handleGradeModelResult(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runId: string,
  rawModelId: string,
): Promise<void> {
  const modelId = parseModelId(rawModelId);

  if (!runIdSchema.safeParse(runId).success || !modelId) {
    sendError(res, 404, "not_found");
    return;
  }

  const body = await readJsonBody(req, gradeModelResultInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if ((await gradeModelResult(runId, modelId, body.data)) === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}

// PATCH /admin/model-comparison/runs/:id/results/:modelId/cards/:index/grade
export async function handleGradeComparisonCard(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  runId: string,
  rawModelId: string,
  rawIndex: string,
): Promise<void> {
  const modelId = parseModelId(rawModelId);
  const cardIndex = cardIndexSchema.safeParse(rawIndex);

  if (!runIdSchema.safeParse(runId).success || !modelId || !cardIndex.success) {
    sendError(res, 404, "not_found");
    return;
  }

  const body = await readJsonBody(req, gradeComparisonCardInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  if ((await gradeComparisonCard(runId, modelId, cardIndex.data, body.data)) === "not_found") {
    sendError(res, 404, "not_found");
    return;
  }

  sendJson(res, 200, { ok: true });
}
