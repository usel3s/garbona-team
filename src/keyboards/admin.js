const { Markup } = require("telegraf");
const { btn } = require("../utils/emoji");

function adminPanelKeyboard(globalPercent = 80) {
  return Markup.inlineKeyboard([
    [btn("Поиск участника", "admin:search", "users")],
    [btn("Postbot", "admin:postbot", "bot")],
    [btn(`Глобальный %: ${globalPercent}%`, "admin:global_percent", "analytics")],
    [btn("Назад", "menu:home", "home")],
  ]);
}

/** Ожидание ввода в админке */
function adminCancelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отменить", "admin:panel", "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

/** Ошибка / «не найдено» — вернуться */
function adminBackKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Вернуться в админку", "admin:panel", "code")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

/** Успех / результат действия */
function adminResultKeyboard() {
  return Markup.inlineKeyboard([
    [btn("В админ-панель", "admin:panel", "code")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function memberActionKeyboard(memberTelegramId, isBanned = false) {
  return Markup.inlineKeyboard([
    [
      btn("Кикнуть", `admin:kick:${memberTelegramId}`, "delete"),
      btn(
        isBanned ? "Разблокировать" : "Забанить",
        isBanned ? `admin:unban:${memberTelegramId}` : `admin:ban:${memberTelegramId}`,
        isBanned ? "unlock" : "userBlocked"
      ),
    ],
    [btn("Отправить сообщение", `admin:msg:${memberTelegramId}`, "broadcast")],
    [
      btn("Начислить профит", `admin:profit:${memberTelegramId}`, "coins"),
      btn("Процент воркера", `admin:percent:${memberTelegramId}`, "settings"),
    ],
    [btn("В админ-панель", "admin:panel", "code")],
  ]);
}

module.exports = {
  adminPanelKeyboard,
  adminCancelKeyboard,
  adminBackKeyboard,
  adminResultKeyboard,
  memberActionKeyboard,
};
