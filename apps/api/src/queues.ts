import { Queue, Worker } from "bullmq";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { processAsset } from "./services/media.js";

const connection = () => {
  const url = new URL(getConfig().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    maxRetriesPerRequest: null,
  };
};

export const assetQueue = new Queue("asset-process", { connection: connection() });

export async function enqueueAsset(assetId: string): Promise<void> {
  await assetQueue.add(
    "process",
    { assetId },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

export function startAssetWorker(): Worker {
  const worker = new Worker(
    "asset-process",
    async (job) => {
      const assetId = String(job.data.assetId);
      await processAsset(assetId);
    },
    { connection: connection(), concurrency: 2 },
  );
  worker.on("failed", (job, error) => {
    logger.error({ jobId: job?.id, err: error }, "asset job failed");
  });
  return worker;
}
