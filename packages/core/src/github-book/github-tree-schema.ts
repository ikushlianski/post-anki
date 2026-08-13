import { z } from "zod";

// The GitHub Trees API response, treated as untrusted external data — only
// the fields this feature reads are validated, everything else the API
// returns is ignored.
export const githubTreeEntrySchema = z.object({
  path: z.string().min(1),
  type: z.string(),
});

export type GithubTreeEntry = z.infer<typeof githubTreeEntrySchema>;

export const githubTreeResponseSchema = z.object({
  tree: z.array(githubTreeEntrySchema),
  truncated: z.boolean().optional().default(false),
});

export type GithubTreeResponse = z.infer<typeof githubTreeResponseSchema>;
