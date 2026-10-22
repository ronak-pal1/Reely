import { connectDb, disconnectDb } from "./db.js";
import { ensureTemplates } from "./services/templates.js";
import { logger } from "./logger.js";

await connectDb();
await ensureTemplates();
logger.info("templates ready");
await disconnectDb();
