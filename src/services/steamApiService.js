const axios = require("axios");
const { env } = require("../config/env");
const {
  withPanelRetry,
  isServiceUnavailable,
  markServiceUnavailable,
  isServiceUnavailableError,
} = require("./apiService");
const { createTtlCache } = require("../utils/ttlCache");

const keyHeaders = { "x-api-key": env.uprojectApiKey };
const TIMEOUT_MS = 20000;
const steamCache = createTtlCache({ defaultTtlMs: 25000, maxEntries: 200 });
const ACCOUNTS_TTL_MS = 25000;

/** Как веб-панель: cookie token без team x-api-key. */
function panelApi(token) {
  return axios.create({
    baseURL: env.uprojectApiBase,
    timeout: TIMEOUT_MS,
    headers: {
      Cookie: `token=${token}`,
      Origin: "https://uproject.io",
      Referer: "https://uproject.io/",
    },
  });
}

function keyClient() {
  return axios.create({
    baseURL: env.uprojectApiBase,
    timeout: TIMEOUT_MS,
    headers: keyHeaders,
  });
}

function accountsCacheKey(token, offset, limit) {
  const scope = token ? `u:${String(token).slice(0, 32)}` : "team";
  return `accounts:${scope}:${offset}:${limit}`;
}

async function steamGet(token, path, params) {
  if (isServiceUnavailable()) {
    const err = new Error("Панель сайтов временно недоступна. Попробуйте чуть позже.");
    err.response = { status: 503 };
    throw err;
  }
  try {
    return await withPanelRetry(async () => {
      const client = token ? panelApi(token) : keyClient();
      return (await client.get(path, { params })).data;
    });
  } catch (error) {
    if (isServiceUnavailableError(error)) markServiceUnavailable(120000);
    throw error;
  }
}

async function getSteamInfo() {
  return steamCache.getOrSet(
    "steam:info",
    () => steamGet(null, env.steamInfoUrl.replace(env.uprojectApiBase, "") || "/steam/info"),
    60 * 1000
  );
}

async function getSteamAccounts(token, { offset = 0, limit = 50 } = {}) {
  const key = accountsCacheKey(token, offset, limit);
  return steamCache.getOrSet(
    key,
    () => steamGet(token, "/steam/accounts", { offset, limit }),
    ACCOUNTS_TTL_MS
  );
}

function invalidateSteamAccountsCache(token) {
  if (token) {
    steamCache.invalidatePrefix(`accounts:u:${String(token).slice(0, 32)}`);
  } else {
    steamCache.invalidatePrefix("accounts:team");
  }
}

async function getSteamAccountById(token, accountId) {
  return steamGet(token, `/steam/accounts/${accountId}`);
}

async function createCheckValidTask(id) {
  steamCache.invalidatePrefix("accounts:");
  return (
    await withPanelRetry(() =>
      axios.post(
        env.steamTasksUrl,
        { tasks: [{ task: "CheckValid" }], ids: [Number(id)], name: "Проверка на валид" },
        { timeout: TIMEOUT_MS, headers: keyHeaders }
      )
    )
  ).data;
}

async function getSteamTaskById(taskId) {
  return (
    await withPanelRetry(() =>
      axios.get(`${env.steamTaskByIdUrl}/${taskId}`, { timeout: TIMEOUT_MS, headers: keyHeaders })
    )
  ).data;
}

async function getSteamInventory(steamId) {
  return (
    await withPanelRetry(() =>
      axios.get(`${env.steamInventoryUrl}/${steamId}`, { timeout: TIMEOUT_MS, headers: keyHeaders })
    )
  ).data;
}

module.exports = {
  getSteamInfo,
  getSteamAccounts,
  getSteamAccountById,
  createCheckValidTask,
  getSteamTaskById,
  getSteamInventory,
  invalidateSteamAccountsCache,
};
