const axios = require("axios");
const { env } = require("../config/env");

const PANEL_TIMEOUT_MS = 30000;

const baseClient = axios.create({
  baseURL: env.uprojectApiBase,
  timeout: PANEL_TIMEOUT_MS,
  headers: { "x-api-key": env.uprojectApiKey },
});

function getAccessToken(payload) {
  return payload?.accessToken || payload?.token || payload?.data?.accessToken || payload?.data?.token || "";
}

function panelClient(token) {
  return axios.create({
    baseURL: env.uprojectApiBase,
    timeout: PANEL_TIMEOUT_MS,
    headers: { "x-api-key": env.uprojectApiKey, Authorization: `Bearer ${token}` },
  });
}

function isTimeoutError(error) {
  return error?.code === "ECONNABORTED" || /timeout/i.test(String(error?.message || ""));
}

async function withPanelRetry(request) {
  try {
    return await request();
  } catch (error) {
    if (!isTimeoutError(error)) throw error;
    return request();
  }
}

async function createWorkerAccount(username, password) {
  const response = await withPanelRetry(() =>
    baseClient.post(env.uprojectApiUrl.replace(env.uprojectApiBase, ""), { username, password })
  );
  return response.data;
}

async function authCredentials(username, password) {
  const response = await withPanelRetry(() => baseClient.post("/auth/credentials", { username, password }));
  return { token: getAccessToken(response.data), data: response.data };
}

async function getDomains(token, offset = 0, limit = 15) {
  return (await withPanelRetry(() => panelClient(token).get("/domains", { params: { offset, limit } }))).data;
}
async function getDomainsList(token) {
  return (await withPanelRetry(() => panelClient(token).get("/domains/list"))).data;
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
  return (await withPanelRetry(() => panelClient(token).get("/domains/actualIPs"))).data;
}
async function createDomain(token, payload) {
  return (await withPanelRetry(() => panelClient(token).post("/domains", payload))).data;
}
async function deleteDomain(token, domainId) {
  return (await withPanelRetry(() => panelClient(token).delete(`/domains/${domainId}`))).data;
}
async function getCloudflareNameservers(token) {
  return (await withPanelRetry(() => panelClient(token).get("/cloudflare/nameservers"))).data;
}
async function getSteamLinks(token, domainId, offset = 0, limit = 15) {
  return (await withPanelRetry(() => panelClient(token).get(`/steam/links/${domainId}`, { params: { offset, limit } }))).data;
}
async function getTemplates(token, offset = 0, limit = 15) {
  return (await withPanelRetry(() => panelClient(token).get("/templates", { params: { offset, limit } }))).data;
}
async function createSteamLink(token, payload) {
  return (await withPanelRetry(() => panelClient(token).post("/steam/links", payload))).data;
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
  try {
    return (await withPanelRetry(() => client.patch(`/steam/links/${domain}`, body))).data;
  } catch (error) {
    if (error?.response?.status !== 404) throw error;
    return (await withPanelRetry(() => client.patch(`/steam/links/${id}`, body))).data;
  }
}
async function getTeamWorkers(token, offset = 0, limit = 100) {
  return (await withPanelRetry(() => panelClient(token).get("/teams/workers/list", { params: { offset, limit } }))).data;
}

function formatPanelError(error) {
  if (isTimeoutError(error)) return "Панель сайтов не отвечает. Попробуйте ещё раз через минуту.";
  return error?.response?.data?.message || error?.message || "Неизвестная ошибка панели.";
}

module.exports = {
  createWorkerAccount,
  authCredentials,
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
};
