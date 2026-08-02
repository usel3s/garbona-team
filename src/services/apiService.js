const axios = require("axios");
const { env } = require("../config/env");
const { createTtlCache } = require("../utils/ttlCache");

const PANEL_TIMEOUT_MS = 25000;
const TOKEN_TTL_MS = 8 * 60 * 1000;
const tokenCache = new Map();
const panelDataCache = createTtlCache({ defaultTtlMs: 45000, maxEntries: 800 });

const CACHE_TTL = {
  domains: 45000,
  links: 45000,
  templates: 5 * 60 * 1000,
  workers: 2 * 60 * 1000,
  ips: 5 * 60 * 1000,
  ns: 5 * 60 * 1000,
};

/** Global pause after uproject 502/503 — shared by poller and panel. */
let serviceUnavailableUntil = 0;

const baseClient = axios.create({
  baseURL: env.uprojectApiBase,
  timeout: PANEL_TIMEOUT_MS,
  headers: { "x-api-key": env.uprojectApiKey },
});

function getAccessToken(payload) {
  return payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token || "";
}

function isTimeoutError(error) {
  return error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""));
}

function isServiceUnavailableError(error) {
  const status = error?.response?.status;
  return status === 502 || status === 503 || status === 504;
}

function markServiceUnavailable(ms = 120000) {
  serviceUnavailableUntil = Math.max(serviceUnavailableUntil, Date.now() + ms);
}

function isServiceUnavailable() {
  return Date.now() < serviceUnavailableUntil;
}

function serviceUnavailableMsLeft() {
  return Math.max(0, serviceUnavailableUntil - Date.now());
}

/**
 * Клиент от имени воркера — как в веб-панели:
 * Cookie token=… без x-api-key команды, иначе owner ссылок = владелец API-ключа.
 */
function panelClient(token) {
  return axios.create({
    baseURL: env.uprojectApiBase,
    timeout: PANEL_TIMEOUT_MS,
    headers: {
      Cookie: `token=${token}`,
      Origin: "https://uproject.io",
      Referer: "https://uproject.io/",
    },
  });
}

async function withPanelRetry(request, { retries = 1 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (isServiceUnavailable()) {
      const err = new Error("Панель сайтов временно недоступна. Попробуйте чуть позже.");
      err.response = { status: 503 };
      throw err;
    }
    try {
      return await request();
    } catch (error) {
      lastError = error;
      // Don't retry 502/503/504 — uproject is overloaded; pause everyone.
      if (isServiceUnavailableError(error)) {
        markServiceUnavailable(120000);
        throw error;
      }
      if (isTimeoutError(error) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function createWorkerAccount(username, password) {
  const response = await withPanelRetry(() =>
    baseClient.post(env.uprojectApiUrl.replace(env.uprojectApiBase, ""), { username, password })
  );
  return response.data;
}

/** Логин как в веб-панели — без x-api-key команды. Кэш токена снижает нагрузку. */
async function authCredentials(username, password) {
  const key = `${String(username || "").toLowerCase()}::${String(password || "")}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() && cached.token) {
    return { token: cached.token, data: cached.data };
  }

  const response = await withPanelRetry(() =>
    axios.post(
      `${env.uprojectApiBase}/auth/credentials`,
      { username, password },
      { timeout: PANEL_TIMEOUT_MS }
    )
  );
  const token = getAccessToken(response.data);
  if (token) {
    tokenCache.set(key, {
      token,
      data: response.data,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
  }
  return { token, data: response.data };
}

function invalidatePanelToken(username) {
  const prefix = `${String(username || "").toLowerCase()}::`;
  for (const key of tokenCache.keys()) {
    if (key.startsWith(prefix)) tokenCache.delete(key);
  }
}

function cacheScope(token) {
  return `t:${String(token || "").slice(0, 32)}`;
}

function invalidatePanelData(token) {
  panelDataCache.invalidatePrefix(cacheScope(token));
}

function invalidateDomainCaches(token) {
  const s = cacheScope(token);
  panelDataCache.invalidatePrefix(`${s}:domains`);
  panelDataCache.invalidatePrefix(`${s}:links`);
  panelDataCache.invalidatePrefix(`${s}:list`);
}

async function getDomains(token, offset = 0, limit = 15) {
  const key = `${cacheScope(token)}:domains:${offset}:${limit}`;
  return panelDataCache.getOrSet(
    key,
    async () =>
      (await withPanelRetry(() => panelClient(token).get("/domains", { params: { offset, limit } }))).data,
    CACHE_TTL.domains
  );
}
async function getDomainsList(token) {
  const key = `${cacheScope(token)}:list`;
  return panelDataCache.getOrSet(
    key,
    async () => (await withPanelRetry(() => panelClient(token).get("/domains/list"))).data,
    CACHE_TTL.domains
  );
}
async function isDomainAvailable(token, domain) {
  return (await withPanelRetry(() => panelClient(token).get("/domains/isAvailable", { params: { domain } }))).data;
}

/**
 * Панель: 200 + { domain } = свободен; 409 = уже занят.
 * Флага isAvailable в ответе нет.
 */
async function checkDomainAvailability(token, domain) {
  try {
    const data = await isDomainAvailable(token, domain);
    if (typeof data === "boolean") return { available: data, data };
    if (data?.isAvailable === false || data?.available === false) {
      return { available: false, data, message: data?.message || "Домен недоступен." };
    }
    // Успешный ответ вида { domain: "kot1.cc" } — домен свободен.
    return { available: true, data };
  } catch (error) {
    const status = error?.response?.status;
    const message = error?.response?.data?.message || error.message;
    if (status === 409 || status === 400 || status === 422) {
      return { available: false, data: error.response?.data, message };
    }
    throw error;
  }
}
async function getActualIPs(token) {
  const key = `${cacheScope(token)}:ips`;
  return panelDataCache.getOrSet(
    key,
    async () => (await withPanelRetry(() => panelClient(token).get("/domains/actualIPs"))).data,
    CACHE_TTL.ips
  );
}
async function createDomain(token, payload) {
  const data = (await withPanelRetry(() => panelClient(token).post("/domains", payload))).data;
  invalidateDomainCaches(token);
  return data;
}
async function deleteDomain(token, domainId) {
  const data = (await withPanelRetry(() => panelClient(token).delete(`/domains/${domainId}`))).data;
  invalidateDomainCaches(token);
  return data;
}
async function getCloudflareNameservers(token) {
  const key = `${cacheScope(token)}:ns`;
  return panelDataCache.getOrSet(
    key,
    async () => (await withPanelRetry(() => panelClient(token).get("/cloudflare/nameservers"))).data,
    CACHE_TTL.ns
  );
}
async function getSteamLinks(token, domainId, offset = 0, limit = 15) {
  const key = `${cacheScope(token)}:links:${domainId}:${offset}:${limit}`;
  return panelDataCache.getOrSet(
    key,
    async () =>
      (
        await withPanelRetry(() =>
          panelClient(token).get(`/steam/links/${domainId}`, { params: { offset, limit } })
        )
      ).data,
    CACHE_TTL.links
  );
}
async function getTemplates(token, offset = 0, limit = 15) {
  const key = `${cacheScope(token)}:templates:${offset}:${limit}`;
  return panelDataCache.getOrSet(
    key,
    async () =>
      (await withPanelRetry(() => panelClient(token).get("/templates", { params: { offset, limit } }))).data,
    CACHE_TTL.templates
  );
}
async function createSteamLink(token, payload) {
  const data = (await withPanelRetry(() => panelClient(token).post("/steam/links", payload))).data;
  invalidateDomainCaches(token);
  return data;
}
const VALID_WINDOW_TYPES = new Set(["FakeWindow", "AboutBlank", "CurrentWindow", "NewWindow"]);

function normalizeWindowType(value) {
  return VALID_WINDOW_TYPES.has(value) ? value : "FakeWindow";
}

async function updateSteamLink(token, domainId, linkId, patch) {
  const domain = Math.trunc(Number(domainId));
  const id = Math.trunc(Number(linkId));
  if (!Number.isFinite(domain) || domain < 1) throw new Error("Некорректный ID домена");
  if (!Number.isFinite(id) || id < 1) throw new Error("Некорректный ID ссылки");
  const body = { id, ...patch };
  if (body.template != null) body.template = Math.trunc(Number(body.template));
  if (body.domain != null) body.domain = Math.trunc(Number(body.domain));
  if (body.windowType != null) body.windowType = normalizeWindowType(body.windowType);
  const client = panelClient(token);
  let data;
  try {
    data = (await withPanelRetry(() => client.patch(`/steam/links/${domain}`, body))).data;
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
    data = (await withPanelRetry(() => client.patch(`/steam/links/${id}`, body))).data;
  }
  invalidateDomainCaches(token);
  return data;
}
async function getTeamWorkers(token, offset = 0, limit = 100) {
  const key = `${cacheScope(token)}:workers:${offset}:${limit}`;
  return panelDataCache.getOrSet(
    key,
    async () =>
      (
        await withPanelRetry(() =>
          panelClient(token).get("/teams/workers/list", { params: { offset, limit } })
        )
      ).data,
    CACHE_TTL.workers
  );
}

function formatPanelError(error) {
  if (isServiceUnavailable() || isServiceUnavailableError(error)) {
    return "Панель сайтов временно недоступна. Попробуйте чуть позже.";
  }
  if (isTimeoutError(error)) return "Панель сайтов не отвечает. Попробуйте ещё раз через минуту.";
  return error?.response?.data?.message || error?.message || "Неизвестная ошибка панели.";
}

module.exports = {
  createWorkerAccount,
  authCredentials,
  invalidatePanelToken,
  invalidatePanelData,
  withPanelRetry,
  getDomains,
  getDomainsList,
  isDomainAvailable,
  checkDomainAvailability,
  getActualIPs,
  getCloudflareNameservers,
  createDomain,
  deleteDomain,
  getSteamLinks,
  getTemplates,
  createSteamLink,
  updateSteamLink,
  normalizeWindowType,
  getTeamWorkers,
  formatPanelError,
  isTimeoutError,
  isServiceUnavailableError,
  isServiceUnavailable,
  markServiceUnavailable,
  serviceUnavailableMsLeft,
};
