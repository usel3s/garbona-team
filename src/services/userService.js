const User = require("../models/User");
const { env } = require("../config/env");

function isAdminTelegramId(telegramId) {
  return env.adminIds.includes(String(telegramId));
}

async function ensureUser(telegramUser) {
  const telegramId = String(telegramUser.id);
  const existing = await User.findOne({ telegramId });
  if (existing) {
    let dirty = false;
    if (telegramUser.username && existing.username !== telegramUser.username) {
      existing.username = telegramUser.username;
      dirty = true;
    }
    if (isAdminTelegramId(telegramId)) {
      if (existing.role !== "admin") {
        existing.role = "admin";
        dirty = true;
      }
      if (!existing.isTeamMember) {
        existing.isTeamMember = true;
        dirty = true;
      }
    }
    if (dirty) await existing.save();
    return existing;
  }

  const isAdmin = isAdminTelegramId(telegramId);
  return User.create({
    telegramId,
    username: telegramUser.username || "",
    role: isAdmin ? "admin" : "user",
    isTeamMember: isAdmin,
  });
}

async function setTeamMember(telegramId, value) {
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { isTeamMember: value },
    { new: true }
  );
}

async function setBan(telegramId, value) {
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { isBanned: value, isTeamMember: value ? false : undefined },
    { new: true }
  );
}

async function listTeamMembers() {
  return User.find({ isTeamMember: true }).sort({ createdAt: -1 }).limit(50);
}

async function getUserByTelegramId(telegramId) {
  return User.findOne({ telegramId: String(telegramId) });
}

async function setProfitPercent(telegramId, percent) {
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { profitPercent: percent },
    { new: true }
  );
}

async function setUserBio(telegramId, bio) {
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { bio: String(bio || "").trim().slice(0, 250) },
    { new: true }
  );
}

async function toggleAnonymous(telegramId) {
  const user = await User.findOne({ telegramId: String(telegramId) });
  if (!user) return null;
  user.isAnonymous = !user.isAnonymous;
  await user.save();
  return user;
}

async function searchTeamMembers(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const byId = /^\d+$/.test(q) ? { telegramId: q } : null;
  const byUsername = { username: { $regex: q.replace(/^@/, ""), $options: "i" } };
  return User.find({
    $or: byId ? [byId, byUsername] : [byUsername],
  })
    .sort({ createdAt: -1 })
    .limit(20);
}

module.exports = {
  ensureUser,
  isAdminTelegramId,
  setTeamMember,
  setBan,
  listTeamMembers,
  getUserByTelegramId,
  setProfitPercent,
  setUserBio,
  toggleAnonymous,
  searchTeamMembers,
};
