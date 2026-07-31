const ProfitTransaction = require("../models/ProfitTransaction");
const User = require("../models/User");

function startOfPeriod(period) {
  const now = new Date();
  if (period === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return null;
}

async function addProfitToUserByTelegramId(telegramId, amount, adminTelegramId) {
  const user = await User.findOne({ telegramId: String(telegramId) });
  if (!user) return null;

  const workerShare = Number(((amount * user.profitPercent) / 100).toFixed(2));
  await ProfitTransaction.create({
    userId: user._id,
    adminTelegramId: String(adminTelegramId),
    amount,
    workerPercent: user.profitPercent,
    workerShare,
  });

  user.totalProfit = Number((user.totalProfit + workerShare).toFixed(2));
  await user.save();
  return { user, workerShare };
}

async function getUserProfitStatsByTelegramId(telegramId, period) {
  const user = await User.findOne({ telegramId: String(telegramId) });
  if (!user) return null;
  const since = startOfPeriod(period);
  const match = { userId: user._id };
  if (since) {
    match.createdAt = { $gte: since };
  }

  const result = await ProfitTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalWorkerShare: { $sum: "$workerShare" },
        count: { $sum: 1 },
      },
    },
  ]);

  const summary = result[0] || { totalWorkerShare: 0, count: 0 };
  return {
    user,
    periodProfit: Number((summary.totalWorkerShare || 0).toFixed(2)),
    operationsCount: summary.count || 0,
  };
}

function daysWithTeam(user) {
  return Math.max(
    1,
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );
}

function nicknameOf(user) {
  return user.username || user.telegramId || "user";
}

async function getProfitDashboard(user) {
  const [agg] = await ProfitTransaction.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        totalShare: { $sum: "$workerShare" },
        maxShare: { $max: "$workerShare" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    days: daysWithTeam(user),
    nickname: nicknameOf(user),
    count: Number(agg?.count || 0),
    totalShare: Number(agg?.totalShare || 0),
    maxShare: Number(agg?.maxShare || 0),
  };
}

async function listUserProfits(user, limit = 50) {
  return ProfitTransaction.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

async function groupUserProfits(user, mode = "month") {
  const groupId =
    mode === "day"
      ? {
          y: { $year: "$createdAt" },
          m: { $month: "$createdAt" },
          d: { $dayOfMonth: "$createdAt" },
        }
      : {
          y: { $year: "$createdAt" },
          m: { $month: "$createdAt" },
        };

  const rows = await ProfitTransaction.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: groupId,
        total: { $sum: "$workerShare" },
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" },
      },
    },
    { $sort: { "_id.y": -1, "_id.m": -1, "_id.d": -1 } },
    { $limit: 40 },
  ]);

  return rows.map((r) => ({
    year: r._id.y,
    month: r._id.m,
    day: r._id.d || null,
    total: Number(r.total || 0),
    count: Number(r.count || 0),
    lastAt: r.lastAt,
  }));
}

module.exports = {
  addProfitToUserByTelegramId,
  getUserProfitStatsByTelegramId,
  getProfitDashboard,
  listUserProfits,
  groupUserProfits,
  daysWithTeam,
  nicknameOf,
};
