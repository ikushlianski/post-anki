import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pendingProbe = pgTable("pending_probe", {
  chatId: text("chat_id").primaryKey(),
  topicId: text("topic_id").notNull(),
  gapId: text("gap_id"),
  mode: text("mode").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatContext = pgTable("chat_context", {
  chatId: text("chat_id").primaryKey(),
  mode: text("mode").notNull(),
  sessionId: text("session_id"),
  currentItemId: text("current_item_id"),
  scopeKind: text("scope_kind"),
  scopeId: text("scope_id"),
  navCurriculumId: text("nav_curriculum_id"),
  label: text("label"),
  messageId: integer("message_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
