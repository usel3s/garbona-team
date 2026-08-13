const { env } = require("../config/env");
const { createCheckValidTask } = require("./steamApiService");
const { submitLogSaleRequest } = require("./steamMonitorService");
const SteamLog = require("../models/SteamLog");
const { logger } = require("../utils/logger");

/**
 * Submit a "sell" request to the steam log sale channel.
 * @param {{ telegram: any }} bot
 * @param {import("../models/User")} worker
 * @param {string} sourceId
 */
async function requestSell({ telegram }, worker, sourceId) {
  const id = String(sourceId || "").trim();
  if (!id) throw new Error("source_id_required");

  const log = await SteamLog.findOne({ sourceId: id });
  if (!log) throw new Error("Лог не найден");

  if (String(log.ownerTelegramId) !== String(worker.telegramId)) {
    throw new Error("Это не ваш лог");
  }

  // Matches callbackHandler: allow only one active request.
  if (log.saleStatus === "pending" || log.saleStatus === "done") {
    throw new Error("Заявка по этому логу уже отправлена");
  }

  await submitLogSaleRequest({ telegram }, log);
  return log;
}

/**
 * Submit a "process" request (отработка) which includes:
 *  - createCheckValidTask (uproject task)
 *  - notify admin channel
 *  - mark SteamLog.processStatus = pending
 *
 * @param {{ telegram: any }} bot
 * @param {import("../models/User")} worker
 * @param {string} sourceId
 */
async function requestProcess({ telegram }, worker, sourceId) {
  const id = String(sourceId || "").trim();
  if (!id) throw new Error("source_id_required");

  const log = await SteamLog.findOne({ sourceId: id });
  if (!log) throw new Error("Лог не найден");

  if (String(log.ownerTelegramId) !== String(worker.telegramId)) {
    throw new Error("Это не ваш лог");
  }

  if (log.processStatus === "pending" || log.processStatus === "done") {
    throw new Error("Заявка на отработку по этому логу уже отправлена");
  }

  // Mark first so UI can disable the action immediately.
  log.processStatus = "pending";
  await log.save();

  // Fire-and-forget: we don't wait for task completion.
  try {
    await createCheckValidTask(id);
  } catch (error) {
    logger.warn("process createCheckValidTask failed", id, error?.message || error);
  }

  const adminChannelId = env.steamAdminLogsChannelId;
  if (telegram && adminChannelId) {
    try {
      const ownerLabel = worker.username ? `@${worker.username}` : `<code>${worker.telegramId}</code>`;
      const text = [
        `Заявка на отработку`,
        `${ownerLabel} · ID: <code>${id}</code>`,
      ].join("\n");
      await telegram.sendMessage(adminChannelId, text, { parse_mode: "HTML" });
    } catch (error) {
      logger.warn("process admin channel notify failed", id, error?.message || error);
    }
  }

  return log;
}

module.exports = {
  requestSell,
  requestProcess,
};

