const { env } = require("../config/env");
const {
  createCheckValidTask,
  getSteamAccountById,
  getSteamInventory,
  invalidateSteamAccountsCache,
} = require("./steamApiService");
const { submitLogSaleRequest } = require("./steamMonitorService");
const { getPanelToken } = require("../handlers/sitesHandler");
const SteamLog = require("../models/SteamLog");
const { logger } = require("../utils/logger");

function asError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function moneyOf(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function inventoryPrice(price = {}) {
  if (price.tradable != null) return moneyOf(price.tradable);
  if (price.marketable != null) return moneyOf(price.marketable);
  if (price.total != null) return moneyOf(price.total);
  return 0;
}

function accountBalance(account) {
  const info = account?.steamInfo || {};
  if (info.balanceUsd != null) return moneyOf(info.balanceUsd);
  return moneyOf(info.balance);
}

function topInventoryItems(inventory, limit = 8) {
  const groups = inventory?.inventories || [];
  const flat = Array.isArray(groups)
    ? groups.flatMap((group) => (Array.isArray(group?.items) ? group.items : []))
    : [];
  const fallback = Array.isArray(inventory?.items) ? inventory.items : [];
  const rows = flat.length ? flat : fallback;

  return rows
    .map((item) => {
      const priceUsd = moneyOf(
        item.price?.usd ?? item.priceUsd ?? item.price ?? 0
      );
      const iconRaw = String(item.icon || item.icon_url || item.iconUrl || "").trim();
      let iconUrl = "";
      if (/^https?:\/\//i.test(iconRaw)) iconUrl = iconRaw;
      else if (iconRaw) {
        iconUrl = `https://community.cloudflare.steamstatic.com/economy/image/${iconRaw}`;
      }
      return {
        name: String(
          item.itemHashName ||
            item.market_hash_name ||
            item.hash_name ||
            item.name ||
            "Item"
        ),
        priceUsd,
        iconUrl,
      };
    })
    .filter((item) => item.priceUsd > 1)
    .sort((a, b) => b.priceUsd - a.priceUsd)
    .slice(0, limit);
}

function gameIconUrl(game) {
  const appid = Number(game?.appid);
  const icon = String(game?.icon || "").trim();
  if (!Number.isFinite(appid) || appid <= 0) return "";
  if (icon) {
    return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${icon}.jpg`;
  }
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`;
}

function serializeGames(account, limit = 10) {
  const games = Array.isArray(account?.gamesInfo) ? account.gamesInfo.filter(Boolean) : [];
  return [...games]
    .sort((a, b) => {
      const aCs = Number(a.appid) === 730 || /counter.?strike/i.test(String(a.name || "")) ? 1 : 0;
      const bCs = Number(b.appid) === 730 || /counter.?strike/i.test(String(b.name || "")) ? 1 : 0;
      if (aCs !== bCs) return bCs - aCs;
      return Number(b.playtime || 0) - Number(a.playtime || 0);
    })
    .slice(0, limit)
    .map((game) => ({
      appid: Number(game.appid) || 0,
      name: String(game.name || `App ${game.appid || "?"}`),
      playtime: Number(game.playtime || 0),
      iconUrl: gameIconUrl(game),
    }));
}

function classifyStatus(row) {
  if (row?.isMaFile === true || /mafile/i.test(String(row?.status || ""))) return "MaFile";
  const status = String(row?.status || "");
  if (/^(ok|valid|валид)$/i.test(status) && !row?.invalidDate) return "Валид";
  if (/невалид|invalid/i.test(status)) return "Невалид";
  return status || "—";
}

async function assertOwnedLog(worker, sourceId) {
  const id = String(sourceId || "").trim();
  if (!id) throw asError("source_id_required");

  const steamLog = await SteamLog.findOne({ sourceId: id });
  if (steamLog && String(steamLog.ownerTelegramId) !== String(worker.telegramId)) {
    throw asError("Это не ваш лог", 403);
  }
  return { id, steamLog };
}

async function loadAccountSafe(worker, sourceId) {
  try {
    const auth = await getPanelToken(worker);
    invalidateSteamAccountsCache(auth.token);
    return await getSteamAccountById(auth.token, sourceId);
  } catch (error) {
    logger.warn("getSteamAccountById failed", sourceId, error?.message || error);
    return null;
  }
}

async function loadInventorySafe(steamId) {
  const sid = String(steamId || "").trim();
  if (!sid) return null;
  try {
    return await getSteamInventory(sid);
  } catch (error) {
    logger.warn("getSteamInventory failed", sid, error?.message || error);
    return null;
  }
}

function buildDetail({ id, account, steamLog, inventory }) {
  const steam = account?.steamInfo || {};
  const balanceUsd = account ? accountBalance(account) : moneyOf(steamLog?.balanceUsd);
  const inventoryUsd = inventory
    ? inventoryPrice(inventory.price)
    : account
      ? inventoryPrice(account?.inventory?.price)
      : moneyOf(steamLog?.inventoryUsd);
  const totalUsd = moneyOf(
    Number(steamLog?.totalProfit) > 0
      ? steamLog.totalProfit
      : balanceUsd + inventoryUsd
  );
  const status = account
    ? classifyStatus(account)
    : steamLog?.logKind === "mafile"
      ? "MaFile"
      : steamLog?.logKind === "valid"
        ? "Валид"
        : steamLog?.logKind === "invalid"
          ? "Невалид"
          : "—";

  const steamId = String(steam.steamid || steam.steamId || steamLog?.steamId || "");
  const invPrice = inventory?.price || account?.inventory?.price || {};

  return {
    id,
    createdAt: account?.createdAt || account?.date || steamLog?.createdAt || null,
    username:
      account?.username || steam.nickname || steamLog?.accountUsername || "",
    level: steam.level ?? null,
    country: steam.country || steam.countryCode || "",
    lastPlayed: steam.lastPlayed || null,
    status,
    steamId,
    steamProfileUrl: steamId ? `https://steamcommunity.com/profiles/${steamId}` : "",
    gamesCount: Number(
      account?.gamesCount ?? account?.gameCount ?? account?.gamesInfo?.length ?? 0
    ),
    games: serializeGames(account),
    balanceUsd,
    inventoryUsd,
    priceUsd: totalUsd,
    inventoryBreakdown: {
      total: moneyOf(invPrice.total),
      tradable: moneyOf(invPrice.tradable),
      marketable: moneyOf(invPrice.marketable),
    },
    topItems: topInventoryItems(inventory),
    saleStatus: String(steamLog?.saleStatus || "none"),
    processStatus: String(steamLog?.processStatus || "none"),
    logKind: String(steamLog?.logKind || ""),
    eventType: /mafile/i.test(status) || steamLog?.logKind === "mafile" ? "mafile" : "log",
  };
}

async function getLogDetail(worker, sourceId) {
  const { id, steamLog } = await assertOwnedLog(worker, sourceId);
  const account = await loadAccountSafe(worker, id);
  if (!account && !steamLog) throw asError("Лог не найден", 404);

  const steamId = String(
    account?.steamInfo?.steamid || account?.steamInfo?.steamId || steamLog?.steamId || ""
  );
  const inventory = await loadInventorySafe(steamId);
  return buildDetail({ id, account, steamLog, inventory });
}

async function refreshLogDetail(worker, sourceId) {
  const { id, steamLog } = await assertOwnedLog(worker, sourceId);
  const account = await loadAccountSafe(worker, id);
  if (!account && !steamLog) throw asError("Лог не найден", 404);

  const steamId = String(
    account?.steamInfo?.steamid || account?.steamInfo?.steamId || steamLog?.steamId || ""
  );
  const inventory = await loadInventorySafe(steamId);
  const detail = buildDetail({ id, account, steamLog, inventory });

  if (steamLog) {
    steamLog.balanceUsd = detail.balanceUsd;
    steamLog.inventoryUsd = detail.inventoryUsd;
    steamLog.totalProfit = detail.priceUsd;
    if (detail.steamId) steamLog.steamId = detail.steamId;
    if (detail.username) steamLog.accountUsername = detail.username;
    await steamLog.save();
  }

  return detail;
}

/**
 * Submit a "sell" request to the steam log sale channel.
 */
async function requestSell({ telegram }, worker, sourceId) {
  const { id, steamLog } = await assertOwnedLog(worker, sourceId);
  if (!steamLog) throw asError("Лог не найден в базе. Дождитесь синхронизации.");

  if (steamLog.saleStatus === "pending" || steamLog.saleStatus === "done") {
    throw asError("Заявка по этому логу уже отправлена");
  }

  await submitLogSaleRequest({ telegram }, steamLog);
  return steamLog;
}

/**
 * Submit a "process" request (отработка) which includes CheckValid + admin notify.
 */
async function requestProcess({ telegram }, worker, sourceId) {
  const { id, steamLog } = await assertOwnedLog(worker, sourceId);
  if (!steamLog) throw asError("Лог не найден в базе. Дождитесь синхронизации.");

  if (steamLog.processStatus === "pending" || steamLog.processStatus === "done") {
    throw asError("Заявка на отработку по этому логу уже отправлена");
  }

  steamLog.processStatus = "pending";
  await steamLog.save();

  try {
    await createCheckValidTask(id);
  } catch (error) {
    logger.warn("process createCheckValidTask failed", id, error?.message || error);
  }

  const adminChannelId = env.steamAdminLogsChannelId;
  if (telegram && adminChannelId) {
    try {
      const ownerLabel = worker.username
        ? `@${worker.username}`
        : `<code>${worker.telegramId}</code>`;
      const text = [
        `Заявка на отработку`,
        `${ownerLabel} · ID: <code>${id}</code>`,
      ].join("\n");
      await telegram.sendMessage(adminChannelId, text, { parse_mode: "HTML" });
    } catch (error) {
      logger.warn("process admin channel notify failed", id, error?.message || error);
    }
  }

  return steamLog;
}

/**
 * Lightweight UProject CheckValid without full process/sale flow.
 */
async function requestCheckValid(worker, sourceId) {
  const { id, steamLog } = await assertOwnedLog(worker, sourceId);
  const account = await loadAccountSafe(worker, id);
  if (!account && !steamLog) throw asError("Лог не найден", 404);

  const task = await createCheckValidTask(id);
  return {
    ok: true,
    taskId: task?.id || null,
    state: task?.state || task?.status || "created",
    name: task?.name || "Проверка на валид",
  };
}

module.exports = {
  requestSell,
  requestProcess,
  requestCheckValid,
  getLogDetail,
  refreshLogDetail,
};
