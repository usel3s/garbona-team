const User = require("../models/User");
const { createWorkerAccount, authCredentials, formatPanelError } = require("./apiService");
const { generatePassword } = require("../utils/password");
const { logger } = require("../utils/logger");

function buildAutoPanelUsername(user) {
  const base = String(user?.username || `u${user?.telegramId || Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 16);
  const suffix = String(user?.telegramId || Date.now()).slice(-4);
  const login = `${base || "worker"}_${suffix}`.slice(0, 24);
  return login.length >= 5 ? login : `worker_${suffix}${String(Date.now()).slice(-4)}`.slice(0, 24);
}

function buildUniquePanelUsername(user) {
  const tid = String(user?.telegramId || Date.now()).slice(-8);
  return `w${tid}_${generatePassword(6).toLowerCase()}`.slice(0, 24);
}

function isUsernameTakenError(error) {
  const status = error?.response?.status;
  const code = String(error?.response?.data?.code || "");
  const message = String(error?.response?.data?.message || error?.message || "");
  return status === 409 || /username_already_exists|already.?exists|уже существует/i.test(`${code} ${message}`);
}

async function persistPanelCredentials(telegramId, panelUsername, panelPassword) {
  const updated = await User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    {
      $set: {
        panelUsername,
        panelPassword,
        panelCreatedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!updated) throw new Error("Пользователь не найден.");
  return updated;
}

async function clearPanelCredentials(telegramId) {
  const updated = await User.findOneAndUpdate(
    { telegramId: String(telegramId) },
    { $set: { panelUsername: "", panelPassword: "", panelCreatedAt: null } },
    { new: true }
  );
  if (!updated) throw new Error("Пользователь не найден.");
  return updated;
}

function syncUserDoc(user, saved) {
  if (!user || !saved) return saved;
  user.panelUsername = saved.panelUsername;
  user.panelPassword = saved.panelPassword;
  user.panelCreatedAt = saved.panelCreatedAt;
  return saved;
}

/**
 * Создаёт служебный доступ к партнёрской панели автоматически.
 * @param {{ forceUnique?: boolean }} [options]
 */
async function ensureWorkerPanelAccount(user, options = {}) {
  if (!user) throw new Error("Пользователь не найден.");
  const forceUnique = Boolean(options.forceUnique);
  if (!forceUnique && user.panelUsername && user.panelPassword) return user;

  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const panelUsername =
      forceUnique || attempt > 0 ? buildUniquePanelUsername(user) : buildAutoPanelUsername(user);
    const panelPassword = generatePassword(12);
    try {
      await createWorkerAccount(panelUsername, panelPassword);
      const saved = await persistPanelCredentials(user.telegramId, panelUsername, panelPassword);
      return syncUserDoc(user, saved);
    } catch (error) {
      lastError = error;
      logger.warn(
        "Panel account create retry",
        user.telegramId,
        error?.response?.data || error.message
      );
      // На занятый логин — сразу следующий уникальный; иначе тоже пробуем ещё раз.
      if (!isUsernameTakenError(error) && !error?.response && attempt >= 2) break;
    }
  }

  throw lastError || new Error("Не удалось подготовить доступ к сайтам.");
}

/** Принудительно создаёт новый panel-аккаунт, затирая текущую привязку. */
async function recreateWorkerPanelAccount(user) {
  if (!user) throw new Error("Пользователь не найден.");
  await clearPanelCredentials(user.telegramId);
  user.panelUsername = "";
  user.panelPassword = "";
  user.panelCreatedAt = null;
  return ensureWorkerPanelAccount(user, { forceUnique: true });
}

/**
 * Привязывает существующий аккаунт панели после проверки логина/пароля.
 */
async function bindWorkerPanelAccount(user, username, password) {
  if (!user) throw new Error("Пользователь не найден.");
  const login = String(username || "").trim();
  const pass = String(password || "").trim();
  if (login.length < 3 || pass.length < 3) {
    throw new Error("Укажите логин и пароль панели.");
  }

  let auth;
  try {
    auth = await authCredentials(login, pass);
  } catch (error) {
    throw new Error(formatPanelError(error));
  }
  if (!auth?.token) {
    throw new Error("Неверный логин или пароль панели.");
  }

  const saved = await persistPanelCredentials(user.telegramId, login, pass);
  return syncUserDoc(user, saved);
}

function parsePanelCredentialsInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  if (raw.includes(":")) {
    const idx = raw.indexOf(":");
    const username = raw.slice(0, idx).trim();
    const password = raw.slice(idx + 1).trim();
    if (!username || !password) return null;
    return { username, password };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { username: parts[0], password: parts.slice(1).join(" ") };
}

module.exports = {
  buildAutoPanelUsername,
  ensureWorkerPanelAccount,
  recreateWorkerPanelAccount,
  bindWorkerPanelAccount,
  parsePanelCredentialsInput,
};
