const { ensureUser } = require("../services/userService");
const { upsertBotMessage } = require("../utils/message");
const { pe } = require("../utils/emoji");
const { clearPendingInputs } = require("../utils/session");
const { env } = require("../config/env");
const {
  feedbackMenuKeyboard,
  feedbackTypeKeyboard,
  feedbackCancelKeyboard,
  feedbackResultKeyboard,
} = require("../keyboards/feedback");
const {
  createFeedback,
  notifyAdminsAboutFeedback,
  typeLabel,
  typeEmojiKey,
} = require("../services/feedbackService");

function isPrivateChat(ctx) {
  return ctx.chat?.type === "private";
}

function feedbackDeepLink() {
  const username = String(env.botUsername || "").replace(/^@/, "");
  return username ? `https://t.me/${username}?start=feedback` : "";
}

async function rejectIfNotPrivate(ctx) {
  if (isPrivateChat(ctx)) return false;
  const link = feedbackDeepLink();
  const text = [
    `${pe("lock")} Фидбек доступен только в личных сообщениях с ботом.`,
    link ? `\nОткройте: ${link}` : "",
  ].join("");
  if (ctx.callbackQuery) {
    try {
      await ctx.answerCbQuery("Только в ЛС с ботом", { show_alert: true });
    } catch (_) {
      /* ignore */
    }
    return true;
  }
  await ctx.reply(text, { parse_mode: "HTML", disable_web_page_preview: true });
  return true;
}

async function renderFeedbackMenu(ctx) {
  if (await rejectIfNotPrivate(ctx)) return;

  const user = await ensureUser(ctx.from);
  if (user.isBanned) {
    await upsertBotMessage(
      ctx,
      `${pe("userBlocked")} Ты заблокирован. Фидбек недоступен.`
    );
    return;
  }

  clearPendingInputs(ctx);
  if (ctx.session) ctx.session.feedbackDraft = null;

  const link = feedbackDeepLink();
  await upsertBotMessage(
    ctx,
    [
      `${pe("notification")} <b>Фидбек</b>`,
      "",
      "Здесь можно сообщить о баге, задать вопрос или предложить идею.",
      "",
      `${pe("file")} <b>Мои обращения</b> — список в inline-режиме.`,
      `${pe("edit")} <b>Написать обращение</b> — новое сообщение команде.`,
      link ? `\n${pe("link")} Ссылка: <code>${link}</code>` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: feedbackMenuKeyboard().reply_markup }
  );
}

function registerFeedbackCommand(bot) {
  const openFeedback = async (ctx) => {
    if (ctx.scene?.current) {
      try {
        await ctx.scene.leave();
      } catch (_) {
        /* ignore */
      }
    }
    await renderFeedbackMenu(ctx);
  };

  bot.command(["feedback", "fb"], openFeedback);

  bot.action("feedback:menu", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await renderFeedbackMenu(ctx);
  });

  bot.action("feedback:new", async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (await rejectIfNotPrivate(ctx)) return;

    const user = await ensureUser(ctx.from);
    if (user.isBanned) {
      await upsertBotMessage(
        ctx,
        `${pe("userBlocked")} Ты заблокирован. Фидбек недоступен.`
      );
      return;
    }

    clearPendingInputs(ctx);
    if (ctx.session) ctx.session.feedbackDraft = { step: "type" };

    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Новое обращение</b>`,
        "",
        "Выберите направление:",
      ].join("\n"),
      { reply_markup: feedbackTypeKeyboard().reply_markup }
    );
  });

  bot.action(/^feedback:type:(bug|question|idea)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (await rejectIfNotPrivate(ctx)) return;

    const type = ctx.match[1];
    if (ctx.session) {
      ctx.session.feedbackDraft = { step: "text", type };
    }

    await upsertBotMessage(
      ctx,
      [
        `${pe(typeEmojiKey(type))} <b>${typeLabel(type)}</b>`,
        "",
        "Опишите обращение одним сообщением.",
        "Можно приложить детали: что делали, что ожидали, что получили.",
      ].join("\n"),
      { reply_markup: feedbackCancelKeyboard().reply_markup }
    );
  });
}

async function handleFeedbackTextInput(ctx, text) {
  const draft = ctx.session?.feedbackDraft;
  if (!draft || draft.step !== "text" || !draft.type) return false;
  if (!isPrivateChat(ctx)) return false;

  const user = await ensureUser(ctx.from);
  if (user.isBanned) {
    ctx.session.feedbackDraft = null;
    await upsertBotMessage(
      ctx,
      `${pe("userBlocked")} Ты заблокирован. Фидбек недоступен.`
    );
    return true;
  }

  try {
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (_) {
    /* ignore */
  }

  try {
    const ticket = await createFeedback(user, { type: draft.type, text });
    ctx.session.feedbackDraft = null;
    await notifyAdminsAboutFeedback(ctx.telegram, ticket);

    await upsertBotMessage(
      ctx,
      [
        `${pe("success")} <b>Обращение отправлено</b>`,
        "",
        `${pe(typeEmojiKey(ticket.type))} ${typeLabel(ticket.type)}`,
        `${pe("tag")} ID: <code>${ticket._id}</code>`,
        "",
        "Мы получили сообщение. Статус смотрите в «Мои обращения».",
      ].join("\n"),
      { reply_markup: feedbackResultKeyboard().reply_markup }
    );
  } catch (error) {
    await upsertBotMessage(
      ctx,
      `${pe("error")} ${error.message || "Не удалось отправить обращение."}`,
      { reply_markup: feedbackCancelKeyboard().reply_markup }
    );
  }

  return true;
}

module.exports = {
  registerFeedbackCommand,
  renderFeedbackMenu,
  handleFeedbackTextInput,
  isPrivateChat,
  feedbackDeepLink,
};
