import pino from "pino";
import { getConfig } from "./config.js";

const config = getConfig();

export const logger = pino({
  level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
});
