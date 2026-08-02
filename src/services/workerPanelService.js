const { getPanelToken } = require("../handlers/sitesHandler");
const { getSteamAccounts, getSteamTaskById } = require("./steamApiService");
const { formatPanelError } = require("./apiService");
const axios = require("axios");
const { env } = require("../config/env");
const { createTtlCache } = require("../utils/ttlCache");

const workerViewCache = createTtlCache({ defaultTtlMs: 25000, maxEntries: 100 });

function accountPrice(account) {
  const balance =
    account?.steamInfo?.balanceUsd != null
      ? Number(account.steamInfo.balanceUsd)
      : Number(account?.steamInfo?.balance || 0);
  const inventory = Number(account?.inventory?.price?.total ?? account?.accountPrice ?? 0);
  const bal = Number.isFinite(balance) ? balance : 0;
  const inv = Number.isFinite(inventory) ? inventory : 0;
  return Number((bal + inv).toFixed(2));
}

function classifyStatus(row) {
  if (row?.isMaFile === true || /mafile/i.test(String(row?.status || ""))) return "MaFile";
  const status = String(row?.status || "");
  if (/^(ok|valid|валид)$/i.test(status) && !row?.invalidDate) return "Валид";
  if (/невалид|invalid/i.test(status)) return "Невалид";
  return status || "—";
}

function serializeLog(row) {
  const steam = row?.steamInfo || {};
  return {
    id: row.id,
    createdAt: row.createdAt || row.date || row.created_at || null,
    username: row.username || steam.nickname || "",
    level: steam.level ?? null,
    country: steam.country || steam.countryCode || "",
    lastPlayed: steam.lastPlayed || null,
    priceUsd: accountPrice(row),
    status: classifyStatus(row),
    steamId: steam.steamid || steam.steamId || "",
    gamesCount: Number(row.gameCount ?? row.gamesInfo?.length ?? 0),
  };
}

function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

async function listWorkerLogs(user, { offset = 0, limit = 30, q = "" } = {}) {
  try {
    const auth = await getPanelToken(user);
    const payload = await getSteamAccounts(auth.token, {
      offset: Math.max(0, Number(offset) || 0),
      limit: Math.min(50, Math.max(1, Number(limit) || 30)),
    });
    let rows = payload?.rows || payload?.data || [];
    if (!Array.isArray(rows)) rows = [];
    const query = String(q || "").trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) => {
        const hay = [row.id, row.username, row.steamInfo?.nickname, row.steamInfo?.steamid, row.status]
          .map((v) => String(v || "").toLowerCase())
          .join(" ");
        return hay.includes(query);
      });
    }
    const logs = rows.map(serializeLog);
    const todayLogs = logs.filter((l) => isToday(l.createdAt));
    return {
      panelUsername: user.panelUsername || "",
      summary: {
        totalLogs: logs.length,
        todayLogs: todayLogs.length,
        todayVisits: 0,
      },
      logs,
    };
  } catch (error) {
    const err = new Error(formatPanelError(error) || error.message || "logs_error");
    err.status = error?.response?.status || 400;
    throw err;
  }
}

async function listWorkerTasks(user) {
  const cacheKey = `tasks:${user.telegramId || user.panelUsername || ""}`;
  const cached = workerViewCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const auth = await getPanelToken(user);
    const client = axios.create({
      baseURL: env.uprojectApiBase,
      timeout: 30000,
      headers: {
        Cookie: `token=${auth.token}`,
        Origin: "https://uproject.io",
        Referer: "https://uproject.io/",
      },
    });
    let payload;
    try {
      payload = (await client.get("/steam/tasks", { params: { offset: 0, limit: 50 } })).data;
    } catch (_) {
      try {
        payload = (await client.get("/tasks", { params: { offset: 0, limit: 50 } })).data;
      } catch (error) {
        const empty = {
          tasks: [],
          message:
            "Задачи создаются из раздела «Логи»: выберите аккаунты и запустите нужную задачу.",
        };
        workerViewCache.set(cacheKey, empty, 15000);
        return empty;
      }
    }
    const rows = payload?.rows || payload?.data || (Array.isArray(payload) ? payload : []);
    const result = {
      tasks: (rows || []).map((t) => ({
        id: t.id,
        name: t.name || t.task || "Задача",
        status: t.status || t.state || "—",
        accounts: t.accountsCount ?? t.ids?.length ?? t.count ?? 0,
        createdAt: t.createdAt || t.date || null,
      })),
      message:
        "Чтобы создать задачу, выберите аккаунты на странице логов (в uproject) и запустите задачу.",
    };
    workerViewCache.set(cacheKey, result, 25000);
    return result;
  } catch (error) {
    if (/Нет аккаунта сайтов|Неверный логин/i.test(String(error.message || ""))) {
      throw error;
    }
    return {
      tasks: [],
      message:
        "На данной странице отображаются задачи. Создайте задачу из раздела логов.",
    };
  }
}

module.exports = {
  listWorkerLogs,
  listWorkerTasks,
  getSteamTaskById,
};
