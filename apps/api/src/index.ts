import { createApp } from "./app.js";
import { getConfig } from "./config.js";
import { connectDb } from "./db.js";
import { logger } from "./logger.js";
import { ensureTemplates } from "./services/templates.js";

const config = getConfig();
await connectDb();
await ensureTemplates();
const app = createApp();
app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "REELIO API listening");
});
