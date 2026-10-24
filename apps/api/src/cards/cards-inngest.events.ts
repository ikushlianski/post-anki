import { eventType, staticSchema } from "inngest";

export const cardsCompileRequestedEvent = eventType("cards/compile.requested", {
  schema: staticSchema<{ topicId: string }>(),
});
