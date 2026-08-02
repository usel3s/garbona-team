const dotenv = require("dotenv");

dotenv.config();

const env = {
  botToken: process.env.BOT_TOKEN,
  mongoUri: process.env.MONGO_URI,
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
  applicationsChannelId: process.env.APPLICATIONS_CHANNEL_ID || "-5246061488",
  aboutPayoutsChatId: process.env.ABOUT_PAYOUTS_CHAT_ID || "-1003821514718",
  aboutWorkersChatId: process.env.ABOUT_WORKERS_CHAT_ID || "-1003710871843",
  aboutManualsChatId: process.env.ABOUT_MANUALS_CHAT_ID || "-1003731342806",
  aboutInfoChannelUrl:
    process.env.ABOUT_INFO_CHANNEL_URL || "https://t.me/garbona",
  /** Публичная ссылка на GitBook / базу мануалов (кнопка в треде). */
  manualsDocsUrl: process.env.MANUALS_DOCS_URL || "",
  feedbackChannelId: process.env.FEEDBACK_CHANNEL_ID || "",
  supportUrl: process.env.SUPPORT_URL || process.env.ABOUT_INFO_CHANNEL_URL || "https://t.me/garbona",
  payoutRequestsChannelId:
    process.env.PAYOUT_REQUESTS_CHANNEL_ID || "-1003840719737",
  walletMinWithdrawalUsd: Number(process.env.WALLET_MIN_WITHDRAWAL_USD || 10),
  /** Комиссия сети при выводе (USD), вычитается из суммы заявки. */
  withdrawFeeUsdtTrc20: Number(process.env.WITHDRAW_FEE_USDT_TRC20 || 7),
  withdrawFeeUsdtBep20: Number(process.env.WITHDRAW_FEE_USDT_BEP20 || 1),
  withdrawFeeTonGram: Number(process.env.WITHDRAW_FEE_TON_GRAM || 0.10),
  uprojectApiBase: process.env.UPROJECT_API_BASE || "https://api.uproject.io",
  uprojectApiUrl: process.env.UPROJECT_API_URL || "https://api.uproject.io/teams/workers/create",
  uprojectApiKey: process.env.UPROJECT_API_KEY || "",
  steamInfoUrl: process.env.STEAM_INFO_URL || "https://api.uproject.io/steam/info",
  steamTasksUrl: process.env.STEAM_TASKS_URL || "https://api.uproject.io/steam/tasks",
  steamTaskByIdUrl: process.env.STEAM_TASK_BY_ID_URL || "https://api.uproject.io/steam/tasks",
  steamInventoryUrl: process.env.STEAM_INVENTORY_URL || "https://api.uproject.io/steam/inventory",
  steamProfitChannelId: process.env.STEAM_PROFIT_CHANNEL_ID || "",
  steamLogSaleChannelId:
    process.env.STEAM_LOG_SALE_CHANNEL_ID || "-1004440736532",
  steamPollIntervalMs: Number(process.env.STEAM_POLL_INTERVAL_MS || 60000),
  /** Delay between per-worker Steam polls when team API key poll is unavailable. */
  steamPollUserDelayMs: Number(process.env.STEAM_POLL_USER_DELAY_MS || 400),
  steamTaskMaxWaitMs: Number(process.env.STEAM_TASK_MAX_WAIT_MS || 120000),
  steamTaskPollIntervalMs: Number(process.env.STEAM_TASK_POLL_INTERVAL_MS || 3000),
  steamWorkerPercent: Number(process.env.STEAM_WORKER_PERCENT || 80),
  referralTemplateId: Number(process.env.REFERRAL_TEMPLATE_ID || 8697),
  // Host platforms (Bothost etc.) inject PORT; PANEL_PORT is for local overrides.
  panelPort: Number(process.env.PORT || process.env.PANEL_PORT || 8787),
  panelCookieSecret:
    process.env.PANEL_COOKIE_SECRET || process.env.BOT_TOKEN || "garbona-panel-dev",
  panelPublicUrl: String(process.env.PANEL_PUBLIC_URL || "").replace(/\/$/, ""),
  botUsername: String(process.env.BOT_USERNAME || "").replace(/^@/, ""),
  /** Temporary: skip Telegram Login / session checks for local panel access. */
  panelAuthDisabled: ["1", "true", "yes", "on"].includes(
    String(process.env.PANEL_AUTH_DISABLED || "").trim().toLowerCase()
  ),
};

function validateEnv() {
  const required = ["botToken", "mongoUri", "uprojectApiKey"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

module.exports = { env, validateEnv };
