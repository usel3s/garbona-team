/**
 * Держит в чате одно сообщение бота: удаляет предыдущее и шлёт новое.
 */
async function upsertBotMessage(ctx, text, extra = {}) {
  const mergedExtra = { parse_mode: "HTML", ...extra };
  const chatId = ctx.chat?.id;
  if (!chatId) return null;

  const ids = new Set();
  const prevId = ctx.session?.ui?.messageId;
  if (prevId) ids.add(prevId);

  const callbackMsgId = ctx.callbackQuery?.message?.message_id;
  if (callbackMsgId) ids.add(callbackMsgId);

  for (const id of ids) {
    try {
      await ctx.telegram.deleteMessage(chatId, id);
    } catch (_) {
      /* уже удалено или недоступно */
    }
  }

  if (ctx.session) {
    ctx.session.ui = { ...(ctx.session.ui || {}), messageId: null };
  }

  const sent = await ctx.reply(text, mergedExtra);
  if (ctx.session) {
    ctx.session.ui = { ...(ctx.session.ui || {}), messageId: sent.message_id };
  }
  return sent.message_id;
}

module.exports = { upsertBotMessage };
