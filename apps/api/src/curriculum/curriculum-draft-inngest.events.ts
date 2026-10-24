import { eventType, staticSchema } from "inngest";

export const curriculumDraftRequestedEvent = eventType("curriculum/draft.requested", {
  schema: staticSchema<{ curriculumId: string; approve: boolean; retry: boolean; ownerToken?: string }>(),
});
