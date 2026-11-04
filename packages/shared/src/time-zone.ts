import { z } from "zod";

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });

    return true;
  } catch {
    return false;
  }
};

export const validTimeZoneSchema = z.string().min(1).refine(isValidTimeZone, "invalid time zone");
