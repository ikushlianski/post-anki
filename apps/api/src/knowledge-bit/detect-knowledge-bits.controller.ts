import type http from "node:http";
import { sendBadGateway, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { detectKnowledgeBits } from "./detect-knowledge-bits.orchestrator.js";
import { embedKnowledgeBits } from "./knowledge-bit-embedding.orchestrator.js";
import { tagKnowledgeBits } from "./knowledge-bit-tagging.orchestrator.js";
import { generateKnowledgeBitQuestions } from "./knowledge-bit-question-generation.orchestrator.js";
import { generateKnowledgeBitFillBlanks } from "./knowledge-bit-fill-blank-generation.orchestrator.js";
import { generateKnowledgeBitBasicCards } from "./knowledge-bit-basic-card-generation.orchestrator.js";
import { embedKnowledgeBitQuestionVariants } from "./knowledge-bit-question-variant-embedding.orchestrator.js";

// A failure here is a real 502 — never a silent "nothing needed detecting".
export async function handleDetectKnowledgeBits(res: http.ServerResponse): Promise<void> {
  try {
    const result = await detectKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_detection_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed embedding".
export async function handleTriggerKnowledgeBitEmbeddingScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await embedKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_embedding_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed tagging".
export async function handleTriggerKnowledgeBitTaggingScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await tagKnowledgeBits();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_tagging_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed generating".
export async function handleTriggerKnowledgeBitQuestionGenerationScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await generateKnowledgeBitQuestions();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_question_generation_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed generating".
export async function handleTriggerKnowledgeBitFillBlankGenerationScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await generateKnowledgeBitFillBlanks();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_fill_blank_generation_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed generating".
export async function handleTriggerKnowledgeBitBasicCardGenerationScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await generateKnowledgeBitBasicCards();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_basic_card_generation_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}

// A failure here is a real 502 — never a silent "nothing needed embedding".
export async function handleTriggerKnowledgeBitQuestionVariantEmbeddingScan(
  res: http.ServerResponse,
): Promise<void> {
  try {
    const result = await embedKnowledgeBitQuestionVariants();

    sendJson(res, 200, result);
  } catch (err) {
    log.error({ err }, "knowledge_bit_question_variant_embedding_scan_failed");

    sendBadGateway(res, "scan_failed");
  }
}
