const { Markup } = require("telegraf");
const { btn } = require("../utils/emoji");

/** Корень: только хабы */
function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [
      btn("Участники", "admin:users", "users"),
      btn("Коммуникация", "admin:comms", "broadcast"),
    ],
    [btn("Статистика", "admin:stats", "statistics")],
    [
      btn("Экономика", "admin:economy", "coins"),
      btn("Логи Steam", "admin:logs", "package"),
    ],
    [btn("Логи бота", "admin:botlogs", "file")],
    [btn("В меню", "menu:home", "home")],
  ]);
}

function adminLogsKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Поиск по ID", "admin:logs:search", "file")],
    [
      {
        text: "Просмотр логов",
        switch_inline_query_current_chat: "logs ",
        icon_custom_emoji_id: "5884479287171485878",
      },
    ],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminBotLogsKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Выгрузить последние 250 строк", "admin:botlogs:export", "download")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminUsersKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Поиск участника", "admin:search", "users")],
    [btn("Воркеры сайтов", "admin:uproject_workers", "users")],
    [
      btn("Кураторы", "admin:curators_list", "userVerified"),
      btn("Прозвонщицы", "admin:callers_list", "broadcast"),
    ],
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
    [btn("Анонс бота", "admin:launch_announce", "celebrate")],
    [btn("Changelog", "admin:changelog", "file")],
    [btn("Назад", "admin:panel", "home")],
  ]);
}

function adminEconomyKeyboard(globalPercent = 80, currency = "USD") {
  const currencyLabel = currency === "RUB" ? "₽ RUB" : "$ USD";
  return Markup.inlineKeyboard([
    [btn(`Глобальный %: ${globalPercent}%`, "admin:global_percent", "analytics")],
    [btn(`Валюта: ${currencyLabel}`, "admin:currency", "coins")],
    [btn("Курс USD→RUB", "admin:currency:rate", "analytics")],
    [
      btn("Фейк-профит", "admin:fake_profit:start", "coins"),
      btn("Фейк-лог", "admin:fake_log:start", "package"),
    ],
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

function memberActionKeyboard(
  memberTelegramId,
  isBanned = false,
  isCurator = false,
  isCaller = false,
  isModerator = false
) {
  const rows = [
    [
      btn("Начислить профит", `admin:profit:${memberTelegramId}`, "coins"),
      btn("Пополнить кошелёк", `admin:wallet:${memberTelegramId}`, "wallet"),
    ],
    [btn("Процент воркера", `admin:percent:${memberTelegramId}`, "settings")],
    [btn("Отправить сообщение", `admin:msg:${memberTelegramId}`, "broadcast")],
    [btn("Аккаунт сайтов", `admin:panelacc:${memberTelegramId}`, "lock")],
    [
      btn(
        isCurator ? "Снять куратора" : "Назначить куратором",
        `admin:curator:${memberTelegramId}`,
        isCurator ? "userBlocked" : "userVerified"
      ),
      btn(
        isCaller ? "Снять прозвонщицу" : "Назначить прозвонщицей",
        `admin:caller:${memberTelegramId}`,
        isCaller ? "userBlocked" : "broadcast"
      ),
    ],
    [
      btn(
        isModerator ? "Снять модератора" : "Добавить модератора",
        `admin:moderator:${memberTelegramId}`,
        isModerator ? "userBlocked" : "lock"
      ),
    ],
  ];
  if (isCurator) {
    rows.push([btn("Настройки куратора", `admin:curator_cfg:${memberTelegramId}`, "edit")]);
  }
  if (isCaller) {
    rows.push([btn("Настройки прозвонщицы", `admin:caller_cfg:${memberTelegramId}`, "edit")]);
  }
  rows.push(
    [
      btn("Кикнуть", `admin:kick:${memberTelegramId}`, "delete"),
      btn(
        isBanned ? "Разблокировать" : "Забанить",
        isBanned ? `admin:unban:${memberTelegramId}` : `admin:ban:${memberTelegramId}`,
        isBanned ? "unlock" : "userBlocked"
      ),
    ],
    [btn("Назад", "admin:users", "home")]
  );
  return Markup.inlineKeyboard(rows);
}

function memberPanelAccountKeyboard(memberTelegramId, hasAccount = false) {
  const rows = [];
  if (hasAccount) {
    rows.push([btn("Пересоздать аккаунт", `admin:panelacc:recreate:${memberTelegramId}`, "loading")]);
    rows.push([btn("Привязать другой", `admin:panelacc:bind:${memberTelegramId}`, "edit")]);
  } else {
    rows.push([btn("Создать аккаунт", `admin:panelacc:create:${memberTelegramId}`, "success")]);
    rows.push([btn("Привязать существующий", `admin:panelacc:bind:${memberTelegramId}`, "edit")]);
  }
  rows.push([btn("Назад", `admin:member:${memberTelegramId}`, "home")]);
  return Markup.inlineKeyboard(rows);
}

function memberPanelRecreateConfirmKeyboard(memberTelegramId) {
  return Markup.inlineKeyboard([
    [btn("Подтвердить пересоздание", `admin:panelacc:recreate:ok:${memberTelegramId}`, "error")],
    [btn("Отмена", `admin:panelacc:${memberTelegramId}`, "home")],
  ]);
}

module.exports = {
  adminPanelKeyboard,
  adminUsersKeyboard,
  adminCommsKeyboard,
  adminEconomyKeyboard,
  adminCurrencyKeyboard,
  adminStatsKeyboard,
  adminLogsKeyboard,
  adminBotLogsKeyboard,
  adminCancelKeyboard,
  adminBackKeyboard,
  adminResultKeyboard,
  memberActionKeyboard,
  memberPanelAccountKeyboard,
  memberPanelRecreateConfirmKeyboard,
};
