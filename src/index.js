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
const {
  isIgnorableTelegramError,
  getTelegramErrorText,
  patchSafeAnswerCbQuery,
} = require("./utils/telegramSafe");

async function bootstrap() {
  validateEnv();
  await connectDatabase();

  const bot = new Telegraf(env.botToken);
  const stage = new Scenes.Stage([applicationScene, postbotScene]);

  bot.use(session());

  bot.use(async (ctx, next) => {
    patchSafeAnswerCbQuery(ctx);
    return next();
  });

  bot.use(stage.middleware());

  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      if (isIgnorableTelegramError(error)) {
        logger.warn("Ignored telegram error", getTelegramErrorText(error));
        return;
      }

      logger.error("Unhandled bot error", error);

      try {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery("Ошибка. Попробуй ещё раз", { show_alert: true });
        }
      } catch (_) {
        /* ignore */
      }

      try {
        if (ctx.chat?.id) {
          await ctx.reply(`${pe("error")} Произошла ошибка. Попробуй ещё раз позже.`, {
            parse_mode: "HTML",
          });
        }
      } catch (_) {
        /* ignore */
      }
    }
  });

  bot.catch((error, ctx) => {
    if (isIgnorableTelegramError(error)) {
      logger.warn("Ignored telegraf catch error", getTelegramErrorText(error));
      return;
    }
    logger.error("Telegraf catch", error, ctx?.updateType || "");
  });

  registerStartCommand(bot);
  registerCallbackHandlers(bot);
  registerTextHandlers(bot);
  registerInlineHandlers(bot);

  process.on("unhandledRejection", (reason) => {
    if (isIgnorableTelegramError(reason)) {
      logger.warn("Ignored unhandledRejection", getTelegramErrorText(reason));
      return;
    }
    logger.error("Unhandled rejection", reason);
  });

  process.on("uncaughtException", (error) => {
    if (isIgnorableTelegramError(error)) {
      logger.warn("Ignored uncaughtException", getTelegramErrorText(error));
      return;
    }
    logger.error("Uncaught exception", error);
  });

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
