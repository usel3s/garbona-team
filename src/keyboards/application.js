const { Markup } = require("telegraf");
const { btn } = require("../utils/emoji");

function applicationCancelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отменить", "app:cancel", "error")],
  ]);
}

function applicationPreviewKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отправить", "app:submit", "success")],
    [btn("Изменить", "app:edit", "edit")],
    [btn("Отменить", "app:cancel", "error")],
  ]);
}

function applicationResultKeyboard() {
  return Markup.inlineKeyboard([[btn("В главное меню", "menu:home", "home")]]);
}

function moderatorApplicationKeyboard(applicationId) {
  return Markup.inlineKeyboard([
    [
      btn("Принять", `moderate:accept:${applicationId}`, "success"),
      btn("Отклонить", `moderate:reject:${applicationId}`, "error"),
    ],
  ]);
}

module.exports = {
  applicationCancelKeyboard,
  applicationPreviewKeyboard,
  applicationResultKeyboard,
  moderatorApplicationKeyboard,
};
