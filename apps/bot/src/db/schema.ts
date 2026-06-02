import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const pendingProbe = pgTable("pending_probe", {
  chatId: text("chat_id").primaryKey(),
  topicId: text("topic_id").notNull(),
  gapId: text("gap_id"),
  mode: text("mode").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
