const { Markup } = require("telegraf");
const { env } = require("../config/env");
const { pe } = require("../utils/emoji");
const { logger } = require("../utils/logger");

function manualsChatId() {
  return env.aboutManualsChatId || "-1003731342806";
}

function manualsDocsUrl() {
  return env.manualsDocsUrl || env.aboutInfoChannelUrl || "https://garbona.gitbook.io/garbona-docs";
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
    "Это живой раздел: материалы будут дополняться по мере роста проекта.",
    "",
    `${pe("package")} <b>Что внутри</b>`,
    "• База знаний для воркеров — от старта до рабочих связок",
    "• Мануалы по источникам трафика и подготовке окружения",
    "• Гайды по продукту, боту и внутренним процессам команды",
    "• Новые инструменты и разделы — будем добавлять сюда же",
    "",
    `${pe("gift")} <b>Расходники</b>`,
    "Команда предоставляет <b>бесплатные расходники</b> для работы —",
    "не нужно тянуть всё на себе с нуля.",
    "",
    `${pe("info")} <b>Как пользоваться</b>`,
    "1. Начинай с актуальных разделов в базе мануалов — меньше хаоса на старте",
    "2. Не сливай материалы мануалов вне команды",
    "3. Вопросы по мануалам — только в личку администраторов",
    "",
    `${pe("gift")} Garbona — возможности для каждого.`,
    "Системность бьёт разовые заливы.",
    "",
    `${pe("link")} <b>Ссылки</b>`,
    ` ┖ Мануал: <a href="${docsUrl}">${String(docsUrl).replace(/^https?:\/\//, "")}</a>`,
    " ┖ Админ: @karma_ceo / @vormafile",
  ].join("\n");
}

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
