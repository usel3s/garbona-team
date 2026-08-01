const axios = require("axios");
const { env } = require("../config/env");

const keyHeaders = { "x-api-key": env.uprojectApiKey };

/** Как веб-панель: cookie token без team x-api-key. */
function panelApi(token) {
  return axios.create({
    baseURL: env.uprojectApiBase,
    timeout: 30000,
    headers: {
      Cookie: `token=${token}`,
      Origin: "https://uproject.io",
      Referer: "https://uproject.io/",
    },
  });
}

async function getSteamInfo() {
  return (await axios.get(env.steamInfoUrl, { timeout: 30000, headers: keyHeaders })).data;
}

async function getSteamAccounts(token, { offset = 0, limit = 50 } = {}) {
  const client = token
    ? panelApi(token)
    : axios.create({ baseURL: env.uprojectApiBase, timeout: 30000, headers: keyHeaders });
  return (await client.get("/steam/accounts", { params: { offset, limit } })).data;
}

async function getSteamAccountById(token, accountId) {
  const client = token
    ? panelApi(token)
    : axios.create({ baseURL: env.uprojectApiBase, timeout: 30000, headers: keyHeaders });
  return (await client.get(`/steam/accounts/${accountId}`)).data;
}

async function createCheckValidTask(id) {
  return (
    await axios.post(
      env.steamTasksUrl,
      { tasks: [{ task: "CheckValid" }], ids: [Number(id)], name: "Проверка на валид" },
      { timeout: 30000, headers: keyHeaders }
    )
  ).data;
}

async function getSteamTaskById(taskId) {
  return (
    await axios.get(`${env.steamTaskByIdUrl}/${taskId}`, { timeout: 30000, headers: keyHeaders })
  ).data;
}

async function getSteamInventory(steamId) {
  return (
    await axios.get(`${env.steamInventoryUrl}/${steamId}`, { timeout: 30000, headers: keyHeaders })
  ).data;
}

module.exports = {
  getSteamInfo,
  getSteamAccounts,
  getSteamAccountById,
  createCheckValidTask,
  getSteamTaskById,
  getSteamInventory,
};
