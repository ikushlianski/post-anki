import { eventType, staticSchema } from "inngest";

export const curriculumResearchRequestedEvent = eventType("curriculum/research.requested", {
  schema: staticSchema<{ curriculumId: string; retry: boolean; ownerToken?: string }>(),
});
