import { eventType, staticSchema } from "inngest";

export const pipelineKickRequestedEvent = eventType(
  "knowledge-bit/pipeline-kick.requested",
  {
    schema: staticSchema<{ requestedAt: number; followUp?: boolean }>(),
  },
);
