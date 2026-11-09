import { z } from "zod";

export const EXTRACTION_INSTRUCTIONS_MAX_CHARS = 1500;
export const EXTRACTION_EXAMPLES_MAX_COUNT = 5;
export const EXTRACTION_EXAMPLE_FIELD_MAX_CHARS = 400;

const exampleField = z.string().trim().min(1).max(EXTRACTION_EXAMPLE_FIELD_MAX_CHARS);

export const extractionExampleSchema = z.object({
  front: exampleField,
  back: exampleField,
  example: exampleField.optional(),
});

export type ExtractionExample = z.infer<typeof extractionExampleSchema>;

export const extractionExamplesSchema = z.array(extractionExampleSchema).max(EXTRACTION_EXAMPLES_MAX_COUNT);
