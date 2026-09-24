import { z } from "zod";

export interface PendingPlacementSuggestion {
  id: string;
  body: string;
  placementSuggestion: string;
}

// PATCH /knowledge-bits/:id/placement-suggestion
export const resolvePlacementSuggestionInput = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("accepted"),
    moduleId: z.string().min(1),
    title: z.string().min(1),
  }),
  z.object({ status: z.literal("rejected") }),
]);

export type ResolvePlacementSuggestionInput = z.infer<typeof resolvePlacementSuggestionInput>;
