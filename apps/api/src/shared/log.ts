import pino from "pino";
import { loadEnv } from "./env.js";

export const log = pino({ level: loadEnv().LOG_LEVEL });
