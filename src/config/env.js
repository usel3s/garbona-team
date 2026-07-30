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
  payoutRequestsChannelId:
    process.env.PAYOUT_REQUESTS_CHANNEL_ID || "-1003840719737",
  walletMinWithdrawalUsd: Number(process.env.WALLET_MIN_WITHDRAWAL_USD || 10),
};

function validateEnv() {
  const required = ["botToken", "mongoUri"];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

module.exports = { env, validateEnv };
