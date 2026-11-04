import { z } from "zod";

export const DEFAULT_LEARNING_STEPS_MINUTES = [1, 10];
export const DEFAULT_RELEARNING_STEPS_MINUTES = [10];
export const DEFAULT_DESIRED_RETENTION = 0.9;
export const MIN_DESIRED_RETENTION = 0.7;
export const MAX_DESIRED_RETENTION = 0.99;
export const MAX_STEPS_COUNT = 10;
export const MIN_STEP_MINUTES = 1;
export const MAX_STEP_MINUTES = 1440;

export const stepsMinutesSchema = z
  .array(z.number().int().min(MIN_STEP_MINUTES).max(MAX_STEP_MINUTES))
  .min(1)
  .max(MAX_STEPS_COUNT);

export const desiredRetentionSchema = z
  .number()
  .min(MIN_DESIRED_RETENTION)
  .max(MAX_DESIRED_RETENTION);


const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const stepsMinutesInputSchema = z
  .array(z.number().finite())
  .min(1)
  .transform((steps) =>
    steps
      .slice(0, MAX_STEPS_COUNT)
      .map((step) => clampNumber(Math.round(step), MIN_STEP_MINUTES, MAX_STEP_MINUTES)),
  );

export const desiredRetentionInputSchema = z
  .number()
  .finite()
  .transform((value) => clampNumber(value, MIN_DESIRED_RETENTION, MAX_DESIRED_RETENTION));

export const APP_STUDY_OPTION_SOURCE = "app";
