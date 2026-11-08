import { eventType, staticSchema } from "inngest";
import { z } from "zod";

export const importIdSchema = z.string().regex(/^[a-z0-9-]{3,40}$/);

export const ankiImportRequestedEvent = eventType("anki-import/requested", {
  schema: staticSchema<{ importId: string }>(),
});
