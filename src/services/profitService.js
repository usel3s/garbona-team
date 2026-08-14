const ProfitTransaction = require("../models/ProfitTransaction");
const User = require("../models/User");
const { sumReservedUsd } = require("./withdrawalService");

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
  const firstName = String(user.firstName || user.first_name || "").trim();
  if (firstName) return firstName;
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

async function resetUserProfitStats(telegramId) {
  const user = await User.findOne({ telegramId: String(telegramId) });
  if (!user) return null;

  const [agg] = await ProfitTransaction.aggregate([
    { $match: { userId: user._id } },
    {
      $group: {
        _id: null,
        totalShare: { $sum: "$workerShare" },
        count: { $sum: 1 },
      },
    },
  ]);

  const removedShare = Number(agg?.totalShare || 0);
  const removedCount = Number(agg?.count || 0);
  if (removedCount === 0) {
    return { user, removedShare: 0, removedCount: 0, newBalance: Number(user.totalProfit || 0) };
  }

  const reserved = await sumReservedUsd(user.telegramId);
  const newBalance = Number(Math.max(0, Number(user.totalProfit || 0) - removedShare).toFixed(2));
  if (newBalance + 1e-9 < reserved) {
    throw new Error(
      `Нельзя обнулить статистику: после списания останется $${newBalance.toFixed(2)}, а под вывод зарезервировано $${reserved.toFixed(2)}.`
    );
  }

  await ProfitTransaction.deleteMany({ userId: user._id });
  user.totalProfit = newBalance;
  await user.save();

  return { user, removedShare, removedCount, newBalance };
}

async function deductUserProfitStats(telegramId, { count, amountUsd }) {
  const user = await User.findOne({ telegramId: String(telegramId) });
  if (!user) return null;

  const n = Math.floor(Number(count) || 0);
  const requestedAmount = Number(Number(amountUsd || 0).toFixed(2));
  if (n < 1) {
    throw new Error("Количество профитов должно быть целым числом от 1.");
  }
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Сумма списания должна быть больше 0.");
  }

  const rows = await ProfitTransaction.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(n)
    .lean();

  if (rows.length < n) {
    throw new Error(`Недостаточно записей профита: есть ${rows.length}, запрошено ${n}.`);
  }

  const removedShare = Number(
    rows.reduce((sum, row) => sum + Number(row.workerShare || 0), 0).toFixed(2)
  );
  const reserved = await sumReservedUsd(user.telegramId);
  const newBalance = Number(Math.max(0, Number(user.totalProfit || 0) - removedShare).toFixed(2));
  if (newBalance + 1e-9 < reserved) {
    throw new Error(
      `Нельзя списать: после операции останется $${newBalance.toFixed(2)}, а под вывод зарезервировано $${reserved.toFixed(2)}.`
    );
  }

  await ProfitTransaction.deleteMany({ _id: { $in: rows.map((row) => row._id) } });
  user.totalProfit = newBalance;
  await user.save();

  return {
    user,
    removedCount: rows.length,
    removedShare,
    requestedAmount,
    newBalance,
  };
}

module.exports = {
  addProfitToUserByTelegramId,
  getUserProfitStatsByTelegramId,
  getProfitDashboard,
  listUserProfits,
  groupUserProfits,
  resetUserProfitStats,
  deductUserProfitStats,
  daysWithTeam,
  nicknameOf,
};
