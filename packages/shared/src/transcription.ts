import { z } from "zod";

export const transcribeAudioInput = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

export type TranscribeAudioInput = z.infer<typeof transcribeAudioInput>;

export const transcribeAudioResponse = z.object({
  text: z.string(),
});

export type TranscribeAudioResponse = z.infer<typeof transcribeAudioResponse>;
