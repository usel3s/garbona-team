const { formatDisplayAmount, getCurrencyContext } = require("../services/currencyService");

function serializeMember(user, currencyCtx, options = {}) {
  if (!user) return null;
  const walletUsd = Number(user.totalProfit || 0);
  const includePanelSecrets = options.includePanelSecrets === true;
  const out = {
    telegramId: String(user.telegramId),
    customId: user.customId || "",
    username: user.username || "",
    firstName: user.firstName || "",
    role: user.role || "user",
    isTeamMember: Boolean(user.isTeamMember),
    isModerator: Boolean(user.isModerator),
    isCurator: Boolean(user.isCurator),
    curatorDescription: user.curatorDescription || "",
    curatorPercent: user.curatorPercent ?? 80,
    curatorMinProfits: user.curatorMinProfits ?? 0,
    curatorTelegramId: user.curatorTelegramId || "",
    isCaller: Boolean(user.isCaller),
    callerDescription: user.callerDescription || "",
    callerPercent: user.callerPercent ?? 80,
    callerMinProfits: user.callerMinProfits ?? 0,
    callerTelegramId: user.callerTelegramId || "",
    isBanned: Boolean(user.isBanned),
    profitPercent: Number(user.profitPercent ?? 80),
    walletUsd,
    walletDisplay: formatDisplayAmount(walletUsd, currencyCtx),
    panelUsername: user.panelUsername || "",
    hasPanelPassword: Boolean(user.panelPassword),
    bio: user.bio || "",
    isAnonymous: Boolean(user.isAnonymous),
    createdAt: user.createdAt || null,
  };
  if (includePanelSecrets) {
    out.panelPassword = user.panelPassword || "";
  }
  return out;
}

function serializeApplication(app) {
  if (!app) return null;
  const userRef = app.userId;
  const userId =
    userRef && typeof userRef === "object"
      ? String(userRef._id || userRef.id || "")
      : String(userRef || "");
  return {
    id: String(app._id),
    userId,
    telegramId: app.telegramId || "",
    username: app.username || "",
    status: app.status,
    answers: app.answers || {},
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  };
}

function serializePayout(req) {
  if (!req) return null;
  return {
    id: String(req._id),
    userId: req.userId ? String(req.userId) : "",
    telegramId: req.telegramId || "",
    amountUsd: Number(req.amountUsd || 0),
    method: req.method,
    walletAddress: req.walletAddress || "",
    status: req.status,
    payoutUrl: req.payoutUrl || "",
    createdAt: req.createdAt,
  };
}

async function withCurrency(fn) {
  const currencyCtx = await getCurrencyContext();
  return fn(currencyCtx);
}

module.exports = {
  serializeMember,
  serializeApplication,
  serializePayout,
  withCurrency,
};
