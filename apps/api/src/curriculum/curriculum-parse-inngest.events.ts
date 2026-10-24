import { eventType, staticSchema } from "inngest";

export const curriculumParseRequestedEvent = eventType("curriculum/parse.requested", {
  schema: staticSchema<{ curriculumId: string; mode: "parse" | "reparse" | "merge"; ownerToken?: string }>(),
});
