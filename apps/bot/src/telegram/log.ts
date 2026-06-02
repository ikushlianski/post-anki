import pino from "pino";
import { loadEnv } from "../env.js";

const env = (() => {
  try {
    return loadEnv();
  } catch {
    return { LOG_LEVEL: "info" as const };
  }
})();

export const log = pino({ level: env.LOG_LEVEL });
