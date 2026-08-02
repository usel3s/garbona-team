/**
 * Сброс всех ожиданий ввода / черновиков операций.
 * Вызывать при /start, «Отмена», «В меню» и входе в корень разделов.
 */
function clearPendingInputs(ctx) {
  if (!ctx.session) return;

  ctx.session.adminInput = null;
  ctx.session.adminCompose = null;
  ctx.session.profileEditBio = null;
  ctx.session.walletWithdraw = null;

  ctx.session.sitesFlow = null;
  ctx.session.linkCreate = null;
  ctx.session.linkCreateStep = null;
  ctx.session.linkTemplates = null;
  ctx.session.referralCache = null;
  ctx.session.panelAuth = null;
  ctx.session.feedbackDraft = null;
}

function isBotCommandText(text) {
  return /^\//.test(String(text || "").trim());
}

module.exports = {
  clearPendingInputs,
  isBotCommandText,
};
