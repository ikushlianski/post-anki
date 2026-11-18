import type http from "node:http";
import {
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  KNOWLEDGE_ITEM_MODEL_OPTIONS,
  chatModelListSchema,
  type ChatModelCostTier,
  type ChatModelOption,
  type KnowledgeItemModelOption,
} from "@post-anki/shared";
import { sendJson } from "../shared/http.js";

const CHEAP_BELOW_USD_PER_MILLION = 0.5;
const MID_BELOW_USD_PER_MILLION = 1;

function costTierOf(option: KnowledgeItemModelOption): ChatModelCostTier {
  const blended = (option.inputPerMillion + option.outputPerMillion) / 2;

  if (blended < CHEAP_BELOW_USD_PER_MILLION) {
    return "cheap";
  }

  return blended < MID_BELOW_USD_PER_MILLION ? "mid" : "premium";
}

function isUsable(option: KnowledgeItemModelOption, today: Date): boolean {
  return option.expiresOn === null || new Date(`${option.expiresOn}T00:00:00Z`) > today;
}

export function listChatModels(today: Date = new Date()): ChatModelOption[] {
  return chatModelListSchema.parse(
    KNOWLEDGE_ITEM_MODEL_OPTIONS.filter((option) => option.chatPickable && isUsable(option, today)).map((option) => ({
      id: option.id,
      label: option.label,
      costTier: costTierOf(option),
      note: option.note,
      expiresOn: option.expiresOn,
      isDefault: option.id === DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
    })),
  );
}

export function handleListChatModels(res: http.ServerResponse): void {
  sendJson(res, 200, listChatModels());
}
