const { Telegraf } = require("telegraf");
const { env, validateEnv } = require("./config/env");
const { connectDatabase } = require("./config/db");
const { startPanelServer } = require("./panel/httpServer");
const { logger } = require("./utils/logger");

async function bootstrap() {
  validateEnv();
  await connectDatabase();

  // Routers expect a Telegraf instance for rare notify calls.
  // Do not launch polling / monitors — panel HTTP only.
  const bot = new Telegraf(env.botToken);
  startPanelServer(bot);

  logger.info("Panel-only mode (bot, steam monitor, dynamic pin disabled)");

  process.once("SIGINT", () => process.exit(0));
  process.once("SIGTERM", () => process.exit(0));
}

bootstrap().catch((error) => {
  logger.error("Panel-only bootstrap failed", error);
  process.exit(1);
});
