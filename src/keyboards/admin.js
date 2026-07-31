const { Markup } = require("telegraf");
const { btn } = require("../utils/emoji");

/** Корень: только хабы */
function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Участники", "admin:users", "users")],
    [btn("Коммуникация", "admin:comms", "broadcast")],
    [btn("Экономика", "admin:economy", "coins")],
    [btn("Статистика", "admin:stats", "statistics")],
    [btn("В меню", "menu:home", "home")],
  ]);
}

function adminUsersKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Поиск участника", "admin:search", "users")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminCommsKeyboard() {
  return Markup.inlineKeyboard([
    [
      btn("Рассылка", "admin:broadcast", "broadcast"),
      btn("Postbot", "admin:postbot", "bot"),
    ],
    [btn("Тред мануалов", "admin:manuals_thread", "file")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminEconomyKeyboard(globalPercent = 80, currency = "USD") {
  const currencyLabel = currency === "RUB" ? "₽ RUB" : "$ USD";
  return Markup.inlineKeyboard([
    [btn(`Глобальный %: ${globalPercent}%`, "admin:global_percent", "analytics")],
    [btn(`Валюта: ${currencyLabel}`, "admin:currency", "coins")],
    [btn("Курс USD→RUB", "admin:currency:rate", "analytics")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminCurrencyKeyboard(currency = "USD") {
  const isUsd = currency !== "RUB";
  return Markup.inlineKeyboard([
    [
      btn(isUsd ? "• USD •" : "USD", "admin:currency:set:USD", "coins"),
      btn(!isUsd ? "• RUB •" : "RUB", "admin:currency:set:RUB", "coins"),
    ],
    [btn("Назад", "admin:economy", "home")],
  ]);
}

function adminStatsKeyboard(selectedPeriod = "all") {
  const label = (period, text) => (selectedPeriod === period ? `• ${text} •` : text);

  return Markup.inlineKeyboard([
    [
      btn(label("24h", "День"), "admin:stats:period:24h", "time"),
      btn(label("7d", "Неделя"), "admin:stats:period:7d", "calendar"),
    ],
    [
      btn(label("30d", "Месяц"), "admin:stats:period:30d", "calendar"),
      btn(label("all", "Всё время"), "admin:stats:period:all", "statistics"),
    ],
    [btn("Управление заявками", "admin:apps", "notification")],
    [btn("Топ воркеров", `admin:stats:top:${selectedPeriod}`, "analytics")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

/** Ожидание ввода: backTo — куда вернуться при отмене */
function adminCancelKeyboard(backTo = "admin:panel") {
  return Markup.inlineKeyboard([
    [btn("Отменить", backTo, "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function adminBackKeyboard(backTo = "admin:panel") {
  return Markup.inlineKeyboard([
    [btn("Назад", backTo, "home")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function adminResultKeyboard(backTo = "admin:users") {
  return Markup.inlineKeyboard([
    [btn("Назад", backTo, "home")],
    [btn("В админ-панель", "admin:panel", "code")],
  ]);
}

function memberActionKeyboard(memberTelegramId, isBanned = false) {
  return Markup.inlineKeyboard([
    [
      btn("Начислить профит", `admin:profit:${memberTelegramId}`, "coins"),
      btn("Процент воркера", `admin:percent:${memberTelegramId}`, "settings"),
    ],
    [btn("Отправить сообщение", `admin:msg:${memberTelegramId}`, "broadcast")],
    [
      btn("Кикнуть", `admin:kick:${memberTelegramId}`, "delete"),
      btn(
        isBanned ? "Разблокировать" : "Забанить",
        isBanned ? `admin:unban:${memberTelegramId}` : `admin:ban:${memberTelegramId}`,
        isBanned ? "unlock" : "userBlocked"
      ),
    ],
    [btn("Назад", "admin:users", "home")],
  ]);
}

module.exports = {
  adminPanelKeyboard,
  adminUsersKeyboard,
  adminCommsKeyboard,
  adminEconomyKeyboard,
  adminCurrencyKeyboard,
  adminStatsKeyboard,
  adminCancelKeyboard,
  adminBackKeyboard,
  adminResultKeyboard,
  memberActionKeyboard,
};
