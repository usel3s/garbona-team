const { Markup } = require("telegraf");
const { env } = require("../config/env");
const { pe } = require("../utils/emoji");
const { logger } = require("../utils/logger");

function manualsChatId() {
  return env.aboutManualsChatId || "-1003731342806";
}

function manualsDocsUrl() {
  return env.manualsDocsUrl || env.aboutInfoChannelUrl || "https://t.me/garbona";
}

function chatDeepLink(chatId, threadId) {
  const raw = String(chatId).replace("-100", "");
  return `https://t.me/c/${raw}/${threadId}`;
}

function buildWelcomeHtml(threadLink, docsUrl) {
  return [
    `${pe("file")} <b>Мануалы Garbona</b>`,
    "",
    "Добро пожаловать в рабочую базу команды.",
    "Здесь — коротко и по делу: от подготовки устройства до креативов и бота.",
    "",
    `${pe("package")} <b>Что внутри</b>`,
    "• Подготовка iPhone / Android / эмуляторов",
    "• YouTube Shorts, Instagram, Snapchat",
    "• Хуки, креативы, клоакинг",
    "• Бот: заявка, кошелёк, профиты и выплаты",
    "",
    `${pe("info")} <b>Как пользоваться</b>`,
    "1. Читай разделы по порядку — меньше хаоса на старте",
    "2. Не сливай материалы вне команды",
    "3. Вопросы по мануалам — только в личку администрации",
    "",
    `${pe("gift")} Garbona — возможности для каждого.`,
    "Системность бьёт разовые заливы.",
    "",
    `${pe("link")} <b>Ссылки</b>`,
    ` ┖ Топик: <a href="${threadLink}">открыть тред</a>`,
    ` ┖ База / канал: <a href="${docsUrl}">${String(docsUrl).replace(/^https?:\/\//, "")}</a>`,
    " ┖ Админ: @karma_ceo",
  ].join("\n");
}

/**
 * Создаёт forum topic в чате мануалов и шлёт приветствие со ссылками.
 */
async function seedManualsThread(telegram, options = {}) {
  const chatId = options.chatId || manualsChatId();
  const docsUrl = options.docsUrl || manualsDocsUrl();
  const topicName = options.topicName || "Мануалы Garbona";

  const topic = await telegram.createForumTopic(chatId, topicName, {
    icon_color: 0x6fb9f0,
  });
  const threadId = topic.message_thread_id;
  const threadLink = chatDeepLink(chatId, threadId);
  const text = buildWelcomeHtml(threadLink, docsUrl);

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url("Открыть мануалы / канал", docsUrl)],
    [Markup.button.url("Открыть этот тред", threadLink)],
  ]);

  const sent = await telegram.sendMessage(chatId, text, {
    message_thread_id: threadId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard.reply_markup,
  });

  let pinned = false;
  try {
    await telegram.pinChatMessage(chatId, sent.message_id, {
      disable_notification: true,
    });
    pinned = true;
  } catch (e) {
    logger.warn("manuals thread pin skipped", e?.response?.description || e.message);
  }

  return {
    chatId,
    threadId,
    threadLink,
    docsUrl,
    messageId: sent.message_id,
    pinned,
  };
}

module.exports = {
  manualsChatId,
  manualsDocsUrl,
  seedManualsThread,
  buildWelcomeHtml,
  chatDeepLink,
};
