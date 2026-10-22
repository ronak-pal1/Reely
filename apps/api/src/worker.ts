import { connectDb } from "./db.js";
import { logger } from "./logger.js";
import { startAssetWorker } from "./queues.js";

await connectDb();
const worker = startAssetWorker();
logger.info("asset worker listening");

async function shutdown() {
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
