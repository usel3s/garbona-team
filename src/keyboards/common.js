const { Markup } = require("telegraf");
const { btn, urlBtn, switchInlineBtn } = require("../utils/emoji");

function applicationStartKeyboard() {
  return Markup.inlineKeyboard([[btn("Подать заявку", "menu:apply", "notification")]]);
}

function rulesAcceptKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Принимаю", "app:rules_accept", "success")],
    [btn("Отменить", "menu:home", "error")],
  ]);
}

function acceptedStartKeyboard() {
  return Markup.inlineKeyboard([[btn("В главное меню", "menu:home", "home")]]);
}

function participantPanelKeyboard(isAdmin) {
  const rows = [
    [btn("Профиль", "menu:profile", "profile")],
    [
      btn("О проекте", "menu:about", "info"),
      btn("Настройки", "menu:settings", "settings"),
    ],
    [btn("Топ воркеров", "menu:top_workers", "analytics")],
  ];
  if (isAdmin) {
    rows.push([btn("Админ-панель", "admin:panel", "code")]);
  }
  return Markup.inlineKeyboard(rows);
}

function profileKeyboard(selectedPeriod = "all") {
  const label = (period, text) => (selectedPeriod === period ? `• ${text} •` : text);

  return Markup.inlineKeyboard([
    [
      btn(label("all", "За всё время"), "profile:stats:all", "calendar"),
      btn(label("24h", "За 24 часа"), "profile:stats:24h", "time"),
    ],
    [
      btn(label("7d", "За 7 дней"), "profile:stats:7d", "calendar"),
      btn(label("30d", "За 30 дней"), "profile:stats:30d", "calendar"),
    ],
    [btn("Мои профиты", "profile:profits", "coins")],
    [btn("Мой кошелёк", "profile:wallet", "wallet")],
    [btn("Назад", "menu:home", "home")],
  ]);
}

function walletKeyboard({ showWithdraw = false } = {}) {
  const rows = [
    [
      {
        text: "История транзакций",
        switch_inline_query_current_chat: "wallet",
        icon_custom_emoji_id: "5870528606328852614",
      },
    ],
  ];
  if (showWithdraw) {
    rows.push([btn("Вывод средств", "wallet:withdraw", "transfer")]);
  }
  rows.push([btn("Назад", "menu:profile", "profile")]);
  return Markup.inlineKeyboard(rows);
}

function profitsKeyboard() {
  return Markup.inlineKeyboard([
    [switchInlineBtn("История моих профитов", "profits", "coins")],
    [switchInlineBtn("История профитов помесячно", "profits?group_by=month", "calendar")],
    [switchInlineBtn("История профитов посуточно", "profits?group_by=day", "time")],
    [btn("Назад", "menu:profile", "profile")],
  ]);
}

function withdrawMethodKeyboard() {
  return Markup.inlineKeyboard([
    [btn("xRocketr", "wallet:method:xRocketr", "link")],
    [btn("CryptoBot", "wallet:method:cryptobot", "cryptobot")],
    [btn("USDT TON", "wallet:method:usdt_ton", "coins")],
    [btn("Отменить", "profile:wallet", "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function walletAmountCancelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отменить", "profile:wallet", "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function settingsCancelKeyboard() {
  return Markup.inlineKeyboard([
    [btn("Отменить", "settings:cancel", "error")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function settingsResultKeyboard() {
  return Markup.inlineKeyboard([
    [btn("К настройкам", "menu:settings", "settings")],
    [btn("В главное меню", "menu:home", "home")],
  ]);
}

function homeOnlyKeyboard() {
  return Markup.inlineKeyboard([[btn("В главное меню", "menu:home", "home")]]);
}

function payoutModerationKeyboard(requestId) {
  const id = String(requestId);
  return Markup.inlineKeyboard([
    [
      btn("Одобрить", `payout:approve:${id}`, "success"),
      btn("Отклонить", `payout:reject:${id}`, "error"),
    ],
  ]);
}

/**
 * @param {string} infoChannelUrl
 * @param {Record<string, string>} inviteUrls
 */
function aboutProjectKeyboard(infoChannelUrl = "https://t.me/garbona", inviteUrls = {}) {
  const infoUrl = String(infoChannelUrl || "https://t.me/garbona").trim();
  const inv = inviteUrls || {};
  const workersBtn = inv.workers_chat
    ? urlBtn("Чат воркеров", inv.workers_chat, "users")
    : btn("Чат воркеров", "about:workers_chat", "users");
  const payoutsBtn = inv.payouts
    ? urlBtn("Выплаты", inv.payouts, "transfer")
    : btn("Выплаты", "about:payouts", "transfer");
  const manualsBtn = inv.manuals
    ? urlBtn("Мануалы", inv.manuals, "file")
    : btn("Мануалы", "about:manuals", "file");

  return Markup.inlineKeyboard([
    [workersBtn, payoutsBtn],
    [manualsBtn, urlBtn("Инфоканал", infoUrl, "broadcast")],
    [btn("Правила", "about:rules", "lock")],
    [btn("Назад", "menu:home", "home")],
  ]);
}

function aboutRulesBackKeyboard() {
  return Markup.inlineKeyboard([[btn("Назад", "menu:about", "info")]]);
}

function settingsKeyboard(isNicknameOpen) {
  return Markup.inlineKeyboard([
    [
      btn(
        isNicknameOpen ? "Ник в выплатах: открыт" : "Ник в выплатах: скрыт",
        "settings:toggle_nick",
        isNicknameOpen ? "visible" : "hidden"
      ),
    ],
    [btn("Добавить описание", "settings:add_description", "edit")],
    [btn("Назад", "menu:home", "home")],
  ]);
}

function topWorkersKeyboard(selectedPeriod = "all", options = {}) {
  const label = (period, text) => (selectedPeriod === period ? `• ${text} •` : text);
  const back = options.back || "menu:home";
  const periodPrefix = options.periodPrefix || "top:period";

  return Markup.inlineKeyboard([
    [
      btn(label("all", "За всё время"), `${periodPrefix}:all`, "calendar"),
      btn(label("24h", "За 24 часа"), `${periodPrefix}:24h`, "time"),
    ],
    [
      btn(label("7d", "За 7 дней"), `${periodPrefix}:7d`, "calendar"),
      btn(label("30d", "За 30 дней"), `${periodPrefix}:30d`, "calendar"),
    ],
    [btn("Назад", back, "home")],
  ]);
}

module.exports = {
  applicationStartKeyboard,
  rulesAcceptKeyboard,
  acceptedStartKeyboard,
  participantPanelKeyboard,
  profileKeyboard,
  walletKeyboard,
  profitsKeyboard,
  withdrawMethodKeyboard,
  walletAmountCancelKeyboard,
  payoutModerationKeyboard,
  aboutProjectKeyboard,
  aboutRulesBackKeyboard,
  settingsKeyboard,
  settingsCancelKeyboard,
  settingsResultKeyboard,
  homeOnlyKeyboard,
  topWorkersKeyboard,
};
