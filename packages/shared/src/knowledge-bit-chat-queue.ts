import { z } from "zod";
import { knowledgeBitRejectReasonSchema } from "./knowledge-bit-review-feedback";
import {
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
} from "./knowledge-bit";

export const CHAT_QUEUE_MAX_USER_TURNS = 8;
export const CHAT_QUEUE_MAX_MESSAGE_CHARS = 1_000;
export const CHAT_QUEUE_REPLAY_MESSAGES = 12;
export const CHAT_QUEUE_CONTEXT_MAX_CHARS = 3_000;
export const CHAT_QUEUE_REPLY_MAX_TOKENS = 900;
export const CHAT_QUEUE_MAX_PROPOSALS = 2;

export const CHAT_QUEUE_PROPOSAL_REASON_MAX_CHARS = 200;

export const chatQueueErrorCodeSchema = z.enum([
  "cap_reached",
  "budget_paused",
  "in_flight",
  "not_in_chat",
  "proposal_not_pending",
]);

export type ChatQueueErrorCode = z.infer<typeof chatQueueErrorCodeSchema>;

export const chatQueueMessageRoleSchema = z.enum(["user", "assistant"]);

export type ChatQueueMessageRole = z.infer<typeof chatQueueMessageRoleSchema>;

export const moveToChatQueueResultSchema = z.object({
  ok: z.literal(true),
  chatCount: z.number().int().min(0),
});

export type MoveToChatQueueResult = z.infer<typeof moveToChatQueueResultSchema>;

export const returnFromChatQueueResultSchema = z.object({ ok: z.literal(true) });

export type ReturnFromChatQueueResult = z.infer<typeof returnFromChatQueueResultSchema>;

export const chatQueueKnowledgeBitSchema = z.object({
  id: z.string().min(1),
  body: z.string(),
  background: z.string().nullable(),
  origin: z.enum(["extracted", "manual"]),
  subjectId: z.string().nullable().optional(),
  subjectName: z.string().nullable(),
  sourceTitle: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  chatAt: z.string(),
  turnsLeft: z.number().int().min(0).max(CHAT_QUEUE_MAX_USER_TURNS),
  snoozedUntil: z.string().nullable(),
  rejectReasonCodes: z.array(knowledgeBitRejectReasonSchema).optional(),
  reviewChat: z.boolean().optional(),
});

export type ChatQueueKnowledgeBit = z.infer<typeof chatQueueKnowledgeBitSchema>;

export const chatQueueKnowledgeBitListSchema = z.object({
  items: z.array(chatQueueKnowledgeBitSchema),
  count: z.number().int().min(0),
  total: z.number().int().min(0).optional(),
  hasMore: z.boolean().optional(),
});

export type ChatQueueKnowledgeBitList = z.infer<typeof chatQueueKnowledgeBitListSchema>;

export const chatQueueCountSchema = z.object({ count: z.number().int().min(0) });

export type ChatQueueCount = z.infer<typeof chatQueueCountSchema>;

export const CHAT_QUEUE_SNOOZE_MIN_DAYS = 1;
export const CHAT_QUEUE_SNOOZE_MAX_DAYS = 30;
export const CHAT_QUEUE_SNOOZE_OPTIONS_DAYS = [1, 3, 7, 14] as const;

export const snoozeChatQueueInput = z.object({
  days: z.number().int().min(CHAT_QUEUE_SNOOZE_MIN_DAYS).max(CHAT_QUEUE_SNOOZE_MAX_DAYS),
});

export type SnoozeChatQueueInput = z.input<typeof snoozeChatQueueInput>;

export const snoozeChatQueueResultSchema = z.object({
  ok: z.literal(true),
  snoozedUntil: z.string().nullable(),
});

export type SnoozeChatQueueResult = z.infer<typeof snoozeChatQueueResultSchema>;

export const CHAT_QUEUE_REMINDER_AFTER_DAYS = 3;

export const staleChatQueueSummarySchema = z.object({
  count: z.number().int().min(0),
  oldestChatAt: z.string().nullable(),
});

export type StaleChatQueueSummary = z.infer<typeof staleChatQueueSummarySchema>;

export const chatQueueProposalKindSchema = z.enum(["create", "update"]);

export const chatQueueProposalStatusSchema = z.enum(["pending", "accepted", "rejected"]);

export type ChatQueueProposalStatus = z.infer<typeof chatQueueProposalStatusSchema>;

export const chatQueueProposalSchema = z.object({
  index: z.number().int().min(0).max(CHAT_QUEUE_MAX_PROPOSALS - 1),
  kind: chatQueueProposalKindSchema,
  front: z.string().trim().min(1).max(MANUAL_ITEM_FRONT_MAX_CHARS),
  back: z.string().trim().min(1).max(MANUAL_ITEM_BACK_MAX_CHARS),
  example: z.string().trim().min(1).max(MANUAL_ITEM_EXAMPLE_MAX_CHARS).optional(),
  reason: z.string().trim().min(1).max(CHAT_QUEUE_PROPOSAL_REASON_MAX_CHARS).optional(),
  status: chatQueueProposalStatusSchema,
  savedCardId: z.string().min(1).optional(),
});

export type ChatQueueProposal = z.infer<typeof chatQueueProposalSchema>;

export const chatQueueProposalListSchema = z.array(chatQueueProposalSchema).max(CHAT_QUEUE_MAX_PROPOSALS);

export const chatQueueMessageSchema = z.object({
  seq: z.number().int().min(1),
  role: chatQueueMessageRoleSchema,
  text: z.string(),
  createdAt: z.string(),
  proposals: chatQueueProposalListSchema.optional(),
});

export type ChatQueueMessage = z.infer<typeof chatQueueMessageSchema>;

export const chatQueueThreadSchema = z.object({
  messages: z.array(chatQueueMessageSchema),
  turnsLeft: z.number().int().min(0).max(CHAT_QUEUE_MAX_USER_TURNS),
  capReached: z.boolean(),
});

export type ChatQueueThread = z.infer<typeof chatQueueThreadSchema>;

export const sendChatQueueMessageInput = z.object({
  clientMessageId: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(CHAT_QUEUE_MAX_MESSAGE_CHARS),
});

export type SendChatQueueMessageInput = z.input<typeof sendChatQueueMessageInput>;

export const sendChatQueueMessageResultSchema = z.object({
  reply: z.string(),
  replySeq: z.number().int().min(1),
  proposals: chatQueueProposalListSchema.optional(),
  turnsLeft: z.number().int().min(0).max(CHAT_QUEUE_MAX_USER_TURNS),
  capReached: z.boolean(),
});

export type SendChatQueueMessageResult = z.infer<typeof sendChatQueueMessageResultSchema>;

export const chatQueueProposalDecisionResultSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["accepted", "rejected"]),
  savedCardId: z.string().min(1).optional(),
});

export type ChatQueueProposalDecisionResult = z.infer<typeof chatQueueProposalDecisionResultSchema>;

export const CHAT_QUEUE_STARTER_PROMPTS = [
  "Why is this card worth keeping?",
  "Explain this in simpler words",
  "Is the answer fully supported by the source?",
  "How could this question be clearer?",
] as const;

export const deleteLastChatExchangeResultSchema = z.object({
  ok: z.literal(true),
  turnsLeft: z.number().int().min(0).max(CHAT_QUEUE_MAX_USER_TURNS),
  capReached: z.boolean(),
});

export type DeleteLastChatExchangeResult = z.infer<typeof deleteLastChatExchangeResultSchema>;

export const CHAT_QUEUE_SEARCH_MIN_CHARS = 2;
export const CHAT_QUEUE_SEARCH_MAX_CHARS = 100;
export const CHAT_QUEUE_SEARCH_LIMIT = 20;

export const chatQueueSearchQuerySchema = z.object({
  q: z.string().trim().min(CHAT_QUEUE_SEARCH_MIN_CHARS).max(CHAT_QUEUE_SEARCH_MAX_CHARS),
});

export type ChatQueueSearchQuery = z.infer<typeof chatQueueSearchQuerySchema>;

export const chatQueueSearchResultSchema = z.object({
  cardId: z.string().min(1),
  seq: z.number().int().min(1),
  role: chatQueueMessageRoleSchema,
  snippet: z.string(),
});

export type ChatQueueSearchResult = z.infer<typeof chatQueueSearchResultSchema>;

export const chatQueueSearchResponseSchema = z.object({
  results: z.array(chatQueueSearchResultSchema).max(CHAT_QUEUE_SEARCH_LIMIT),
  hasMore: z.boolean().optional(),
});

export type ChatQueueSearchResponse = z.infer<typeof chatQueueSearchResponseSchema>;
