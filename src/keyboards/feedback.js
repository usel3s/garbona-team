const { Markup } = require("telegraf");
const { btn, switchInlineBtn } = require("../utils/emoji");

function feedbackMenuKeyboard() {
  return Markup.inlineKeyboard([
    [switchInlineBtn("Мои обращения", "feedback", "file")],
    [btn("Написать обращение", "feedback:new", "edit")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function feedbackTypeKeyboard() {
  return Markup.inlineKeyboard([
    [
      btn("Баг", "feedback:type:bug", "error"),
      btn("Вопрос", "feedback:type:question", "info"),
    ],
    [btn("Предложить идею", "feedback:type:idea", "gift")],
    [btn("Назад", "feedback:menu", "home")],
  ]);
}

function feedbackCancelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отменить", "feedback:menu", "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function feedbackResultKeyboard() {
  return Markup.inlineKeyboard([
    [switchInlineBtn("Мои обращения", "feedback", "file")],
    [btn("Ещё обращение", "feedback:new", "edit")],
    [btn("В меню фидбека", "feedback:menu", "notification")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

module.exports = {
  feedbackMenuKeyboard,
  feedbackTypeKeyboard,
  feedbackCancelKeyboard,
  feedbackResultKeyboard,
};
