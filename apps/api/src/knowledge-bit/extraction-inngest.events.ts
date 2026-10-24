import { eventType, staticSchema } from "inngest";

export const extractionRequestedEvent = eventType(
  "knowledge-source/extraction.requested",
  {
    schema: staticSchema<{
      sourceId: string;
      run: number;
      regeneration: boolean;
    }>(),
  },
);

export const extractionCancelRequestedEvent = eventType(
  "knowledge-source/extraction.cancel-requested",
  {
    schema: staticSchema<{
      sourceId: string;
      run: number;
    }>(),
  },
);
