const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const { pe, urlBtn } = require("../utils/emoji");
const { Markup } = require("telegraf");

const LOCK_STATUSES = ["pending", "awaiting_payout_link"];

const METHOD_LABELS = {
  usdt_trc20: "USDT TRC20",
  usdt_bep20: "USDT BEP20",
  ton_gram: "TON (GRAM)",
  xRocketr: "xRocketr",
  cryptobot: "CryptoBot",
  usdt_ton: "USDT TON",
};

function methodLabel(method) {
  return METHOD_LABELS[method] || method;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeWalletAddress(raw) {
  return String(raw || "").trim().replace(/\s+/g, "");
}

function validateWalletAddress(method, address) {
  const addr = normalizeWalletAddress(address);
  if (!addr || addr.length < 10 || addr.length > 128) {
    return { ok: false, error: "Некорректный адрес кошелька." };
  }

  if (method === "usdt_trc20") {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) {
      return { ok: false, error: "Адрес TRC20 должен начинаться с T и содержать 34 символа." };
    }
  } else if (method === "usdt_bep20") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      return { ok: false, error: "Адрес BEP20 должен быть в формате 0x… (42 символа)." };
    }
  } else if (method === "ton_gram") {
    if (!/^(EQ|UQ)[A-Za-z0-9_-]{46}$/.test(addr) && !/^0:[a-fA-F0-9]{64}$/.test(addr)) {
      return {
        ok: false,
        error: "Адрес TON должен начинаться с EQ/UQ или быть в формате 0:…",
      };
    }
  }

  return { ok: true, address: addr };
}

async function sumReservedUsd(telegramId) {
  const agg = await WithdrawalRequest.aggregate([
    { $match: { telegramId: String(telegramId), status: { $in: LOCK_STATUSES } } },
    { $group: { _id: null, total: { $sum: "$amountUsd" } } },
  ]);
  return Number((agg[0]?.total || 0).toFixed(2));
}

async function getAvailableUsd(user) {
  const reserved = await sumReservedUsd(user.telegramId);
  return Number((Number(user.totalProfit || 0) - reserved).toFixed(2));
}

async function hasPendingRequest(telegramId) {
  const n = await WithdrawalRequest.countDocuments({
    telegramId: String(telegramId),
    status: { $in: LOCK_STATUSES },
  });
  return n > 0;
}

async function createWithdrawalRequest(user, amountUsd, method, walletAddress) {
  const available = await getAvailableUsd(user);
  if (amountUsd > available + 1e-9) {
    throw new Error("Недостаточно средств с учётом активных заявок.");
  }
  const check = validateWalletAddress(method, walletAddress);
  if (!check.ok) throw new Error(check.error);

  return WithdrawalRequest.create({
    userId: user._id,
    telegramId: String(user.telegramId),
    username: user.username || "",
    amountUsd,
    method,
    walletAddress: check.address,
    status: "pending",
  });
}

async function attachChannelMeta(requestId, chatId, messageId) {
  return WithdrawalRequest.findByIdAndUpdate(
    requestId,
    {
      channelChatId: String(chatId),
      channelMessageId: String(messageId),
    },
    { new: true }
  );
}

async function resetPendingApproval(requestId) {
  return WithdrawalRequest.findByIdAndUpdate(
    requestId,
    { status: "pending", awaitingAdminTelegramId: "" },
    { new: true }
  );
}

async function setAwaitingPayoutLink(requestId, adminTelegramId) {
  return WithdrawalRequest.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    {
      status: "awaiting_payout_link",
      awaitingAdminTelegramId: String(adminTelegramId),
    },
    { new: true }
  ).populate("userId");
}

async function findAwaitingLinkForAdmin(adminTelegramId) {
  return WithdrawalRequest.findOne({
    status: "awaiting_payout_link",
    awaitingAdminTelegramId: String(adminTelegramId),
  })
    .sort({ updatedAt: -1 })
    .populate("userId");
}

async function completePayoutWithLink(requestId, payoutUrl, adminTelegramId) {
  const req = await WithdrawalRequest.findById(requestId);
  if (!req || req.status !== "awaiting_payout_link") {
    throw new Error("Заявка не ожидает ссылку.");
  }

  const user = await User.findOneAndUpdate(
    { _id: req.userId, totalProfit: { $gte: req.amountUsd } },
    { $inc: { totalProfit: -req.amountUsd } },
    { new: true }
  );
  if (!user) {
    throw new Error("Недостаточно средств на балансе пользователя.");
  }

  req.status = "approved";
  req.payoutUrl = payoutUrl;
  req.awaitingAdminTelegramId = "";
  req.resolvedByTelegramId = String(adminTelegramId);
  await req.save();

  return { request: req, user };
}

async function rejectPayout(requestId, adminTelegramId) {
  return WithdrawalRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: ["pending", "awaiting_payout_link"] } },
    {
      status: "rejected",
      awaitingAdminTelegramId: "",
      resolvedByTelegramId: String(adminTelegramId),
    },
    { new: true }
  ).populate("userId");
}

async function listUserRequests(telegramId, limit = 15) {
  return WithdrawalRequest.find({ telegramId: String(telegramId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

function buildChannelMessageHtml(req) {
  const m = methodLabel(req.method);
  const wallet = String(req.walletAddress || "").trim();
  return [
    `${pe("transfer")} <b>Заявка на выплату</b>`,
    "",
    `<b>ID:</b> <code>${req._id}</code>`,
    `<b>User ID:</b> <code>${req.telegramId}</code>`,
    `<b>Username:</b> @${req.username || "—"}`,
    `<b>Сумма:</b> $${Number(req.amountUsd).toFixed(2)}`,
    `<b>Сеть:</b> ${m}`,
    wallet ? `<b>Кошелёк:</b> <code>${escapeHtml(wallet)}</code>` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWithdrawConfirmHtml({ method, address, amountUsd }) {
  return [
    `${pe("transfer")} <b>Подтверждение вывода</b>`,
    "",
    `${pe("coins")} Сеть: <b>${methodLabel(method)}</b>`,
    `${pe("wallet")} Кошелёк: <code>${escapeHtml(address)}</code>`,
    `${pe("transfer")} Сумма: <b>$${Number(amountUsd).toFixed(2)}</b>`,
    "",
    "Проверьте данные и нажмите <b>Отправить</b>.",
  ].join("\n");
}

function buildApprovedChannelSuffix() {
  return `\n\n${pe("success")} <b>Выплата одобрена</b> — ссылка отправлена пользователю.`;
}

function buildRejectedChannelSuffix() {
  return `\n\n${pe("error")} <b>Выплата отклонена</b>.`;
}

function normalizePayoutUrl(text) {
  const trimmed = String(text || "").trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch (_) {
    return null;
  }
}

function buildUserPayoutApprovedMessage() {
  return [
    `${pe("celebrate")} <b>Поздравляем, вам успешно одобрен вывод!</b>`,
    "",
    "Транзакция доступна по кнопке ниже.",
  ].join("\n");
}

function payoutApprovedUserKeyboard(url) {
  return Markup.inlineKeyboard([[urlBtn("Открыть транзакцию", url, "link")]]);
}

module.exports = {
  methodLabel,
  validateWalletAddress,
  sumReservedUsd,
  getAvailableUsd,
  hasPendingRequest,
  createWithdrawalRequest,
  setAwaitingPayoutLink,
  findAwaitingLinkForAdmin,
  completePayoutWithLink,
  rejectPayout,
  listUserRequests,
  buildChannelMessageHtml,
  buildWithdrawConfirmHtml,
  buildApprovedChannelSuffix,
  buildRejectedChannelSuffix,
  attachChannelMeta,
  normalizePayoutUrl,
  buildUserPayoutApprovedMessage,
  payoutApprovedUserKeyboard,
  resetPendingApproval,
};
