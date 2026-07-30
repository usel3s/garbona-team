const { Telegraf, session, Scenes } = require("telegraf");
const { env, validateEnv } = require("./config/env");
const { connectDatabase } = require("./config/db");
const { registerStartCommand } = require("./commands/start");
const { registerCallbackHandlers } = require("./handlers/callbackHandler");
const { registerTextHandlers } = require("./handlers/textHandler");
const { registerInlineHandlers } = require("./handlers/inlineHandler");
const { applicationScene } = require("./scenes/applicationScene");
const { postbotScene } = require("./scenes/postbotScene");
const { logger } = require("./utils/logger");
const { pe } = require("./utils/emoji");

async function bootstrap() {
  validateEnv();
  await connectDatabase();

  const bot = new Telegraf(env.botToken);
  const stage = new Scenes.Stage([applicationScene, postbotScene]);

  bot.use(session());
  bot.use(stage.middleware());

  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      logger.error("Unhandled bot error", error);
      try {
        await ctx.reply(`${pe("error")} Произошла ошибка. Попробуй ещё раз позже.`, {
          parse_mode: "HTML",
        });
      } catch (_) {
        /* ignore */
      }
    }
  });

  registerStartCommand(bot);
  registerCallbackHandlers(bot);
  registerTextHandlers(bot);
  registerInlineHandlers(bot);

  bot.launch({
    allowedUpdates: [
      "message",
      "callback_query",
      "inline_query",
      "chosen_inline_result",
    ],
  });
  logger.info("Bot started");

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

bootstrap().catch((error) => {
  logger.error("Bootstrap failed", error);
  process.exit(1);
});
