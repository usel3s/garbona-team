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
  const update = { isTeamMember: value };
  if (!value) update.isCurator = false;
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    update,
    { new: true }
  );
}

async function setBan(telegramId, value) {
  return User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    {
      isBanned: value,
      isTeamMember: value ? false : undefined,
      isCurator: value ? false : undefined,
    },
    { new: true }
  );
}

async function setCurator(telegramId, value) {
  const update = { isCurator: Boolean(value) };
  if (!value) {
    update.curatorDescription = "";
    update.curatorPercent = 80;
    update.curatorMinProfits = 0;
  }
  const updated = await User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    update,
    { new: true }
  );
  if (!value) {
    await User.updateMany(
      { curatorTelegramId: String(telegramId) },
      { curatorTelegramId: "" }
    );
  }
  return updated;
}

async function listCurators() {
  return User.find({
    isCurator: true,
    isBanned: { $ne: true },
  })
    .sort({ username: 1, createdAt: 1 })
    .limit(50);
}

async function listTeamMembers() {
  return User.find({ isTeamMember: true }).sort({ createdAt: -1 }).limit(50);
}

async function getUserByTelegramId(telegramId) {
  return User.findOne({ telegramId: String(telegramId) });
}

async function getUserByPanelUsername(panelUsername) {
  const login = String(panelUsername || "").trim();
  if (!login) return null;
  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return User.findOne({ panelUsername: new RegExp(`^${escaped}$`, "i") });
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

/** Точное совпадение по ID/username, иначе первый результат поиска. */
async function findUserByQuery(query) {
  const results = await searchTeamMembers(query);
  if (!results.length) return null;

  const q = String(query || "")
    .trim()
    .replace(/^@/, "");
  if (/^\d+$/.test(q)) {
    return results.find((u) => String(u.telegramId) === q) || results[0];
  }

  const needle = q.toLowerCase();
  const exact = results.find((u) => String(u.username || "").toLowerCase() === needle);
  return exact || results[0];
}

async function isTeamReferralPathTaken(domainId, path) {
  return (await User.countDocuments({
    teamReferrals: { $elemMatch: { domainId: Number(domainId), path: String(path) } },
  })) > 0;
}

async function getTeamReferralForDomain(telegramId, domainId) {
  const user = await getUserByTelegramId(telegramId);
  return user?.teamReferrals?.find((row) => Number(row.domainId) === Number(domainId)) || null;
}

async function upsertTeamReferral(telegramId, { domainId, path, panelLinkId }) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) return null;
  const referrals = (user.teamReferrals || []).filter(
    (row) => Number(row.domainId) !== Number(domainId)
  );
  referrals.push({
    domainId: Number(domainId),
    path: String(path),
    panelLinkId: Number.isFinite(Number(panelLinkId)) ? Number(panelLinkId) : null,
  });
  user.teamReferrals = referrals;
  await user.save();
  return user;
}

module.exports = {
  ensureUser,
  isAdminTelegramId,
  setTeamMember,
  setBan,
  setCurator,
  listCurators,
  listTeamMembers,
  getUserByTelegramId,
  getUserByPanelUsername,
  setProfitPercent,
  setUserBio,
  toggleAnonymous,
  searchTeamMembers,
  findUserByQuery,
  isTeamReferralPathTaken,
  getTeamReferralForDomain,
  upsertTeamReferral,
};
