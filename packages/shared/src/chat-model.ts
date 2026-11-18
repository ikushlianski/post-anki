import { z } from "zod";
import { knowledgeItemModelIdSchema } from "./knowledge-item-model";

export const CHAT_MODEL_CONTEXT_KEY = "chatModelId";

export const chatModelIdSchema = knowledgeItemModelIdSchema;

export const chatModelCostTierSchema = z.enum(["cheap", "mid", "premium"]);

export type ChatModelCostTier = z.infer<typeof chatModelCostTierSchema>;

export const chatModelOptionSchema = z.object({
  id: chatModelIdSchema,
  label: z.string(),
  costTier: chatModelCostTierSchema,
  note: z.string(),
  expiresOn: z.string().nullable(),
  isDefault: z.boolean(),
});

export type ChatModelOption = z.infer<typeof chatModelOptionSchema>;

export const chatModelListSchema = z.array(chatModelOptionSchema);
