const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1672;
const HEIGHT = 941;
const ASSETS_DIR = path.join(__dirname, "../../assets/steam-log");
const BG_PATH = path.join(ASSETS_DIR, "bg.png");
const FALLBACK_GAME_PATH = path.join(ASSETS_DIR, "game-cs2.png");

/**
 * Позиции из Figma 427:33 (относительно кадра 1672×941).
 * Текст: Gilroy Medium 40 / left / top.
 */
const VALUE_SLOTS = {
  limit: { x: 136, y: 400, w: 275 },
  balance: { x: 617, y: 400, w: 275 },
  inventory: { x: 1138, y: 400, w: 275 },
  level: { x: 135, y: 618, w: 275 },
  lastActive: { x: 892, y: 618, w: 415 },
};

const GAME_SLOT = { x: 97, y: 722, w: 267, h: 125 };
const FONT = `500 40px "Segoe UI", Arial, sans-serif`;
const MONEY_COLOR = "#59CD53";
const VALUE_COLOR = "#FFFFFF";
const IMAGE_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function formatMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `$${num.toFixed(2).replace(/\.00$/, "").replace(".", ",")}`;
}

function formatDateRu(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLimit(account) {
  const locked = Number(account?.inventory?.price?.locked || 0);
  const lockedDate = Number(account?.inventory?.price?.lockedDate || 0);
  if (lockedDate > 0) {
    const ms = lockedDate > 1e12 ? lockedDate : lockedDate * 1000;
    return formatDateRu(ms);
  }
  if (locked > 0) return formatMoney(locked);
  return "Нет лимита";
}

function formatBalance(account) {
  const steam = account?.steamInfo || {};
  if (steam.balanceUsd != null && Number.isFinite(Number(steam.balanceUsd))) {
    return formatMoney(steam.balanceUsd);
  }
  if (steam.balance != null && Number.isFinite(Number(steam.balance))) {
    const currency = steam.balanceCurrency && steam.balanceCurrency !== "USD" ? ` ${steam.balanceCurrency}` : "";
    return `${formatMoney(steam.balance)}${currency}`.replace(/^\$/, currency ? "" : "$");
  }
  return "$0";
}

function formatInventory(account) {
  return formatMoney(account?.inventory?.price?.total ?? account?.accountPrice ?? 0);
}

function formatLevel(account) {
  const level = account?.steamInfo?.level;
  return level == null || level === "" ? "—" : `${level} LVL`;
}

function formatLastActive(account) {
  const value = account?.steamInfo?.lastPlayed;
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return formatDateRu(date);

  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)} мин. назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} дн. назад`;
  return formatDateRu(date);
}

function pickPrimaryGame(account) {
  const games = Array.isArray(account?.gamesInfo) ? account.gamesInfo.filter(Boolean) : [];
  if (!games.length) return null;
  const cs2 = games.find((g) => Number(g.appid) === 730 || /counter.?strike/i.test(String(g.name || "")));
  if (cs2) return cs2;
  return [...games].sort((a, b) => Number(b.playtime || 0) - Number(a.playtime || 0))[0];
}

function gameImageUrls(game) {
  const appid = Number(game?.appid);
  const icon = String(game?.icon || "").trim();
  const urls = [];
  if (Number.isFinite(appid) && appid > 0) {
    urls.push(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
      `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/capsule_231x87.jpg`,
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
    );
    if (icon) {
      urls.push(`https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${icon}.jpg`);
    }
  }
  return urls;
}

async function loadRemoteImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 12000,
    headers: IMAGE_HEADERS,
    validateStatus: (s) => s >= 200 && s < 300,
  });
  return loadImage(Buffer.from(response.data));
}

async function loadGameImage(account) {
  const game = pickPrimaryGame(account);
  if (game) {
    for (const url of gameImageUrls(game)) {
      try {
        return await loadRemoteImage(url);
      } catch (_) {
        // try next CDN
      }
    }
  }
  try {
    return await loadImage(FALLBACK_GAME_PATH);
  } catch (_) {
    return null;
  }
}

function drawValue(ctx, text, slot, { color = VALUE_COLOR } = {}) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 6;
  const maxWidth = slot.w || 275;
  let value = String(text ?? "—");
  while (ctx.measureText(value).width > maxWidth && value.length > 3) {
    value = `${value.slice(0, -2)}…`;
  }
  ctx.fillText(value, slot.x, slot.y, maxWidth);
  ctx.restore();
}

function drawRoundedImage(ctx, image, x, y, w, h, radius = 12) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(image, dx, dy, dw, dh);
  ctx.restore();
}

/**
 * Карточка «Новый лог» по макету Figma node 427:33.
 * Поля: лимит, баланс, инвентарь, уровень, последний актив + иконка игры.
 */
async function renderSteamLogImage(account = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const bg = await loadImage(BG_PATH);
  ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);

  drawValue(ctx, formatLimit(account), VALUE_SLOTS.limit);
  drawValue(ctx, formatBalance(account), VALUE_SLOTS.balance, { color: MONEY_COLOR });
  drawValue(ctx, formatInventory(account), VALUE_SLOTS.inventory, { color: MONEY_COLOR });
  drawValue(ctx, formatLevel(account), VALUE_SLOTS.level);
  drawValue(ctx, formatLastActive(account), VALUE_SLOTS.lastActive);

  const gameImage = await loadGameImage(account);
  if (gameImage) {
    drawRoundedImage(ctx, gameImage, GAME_SLOT.x, GAME_SLOT.y, GAME_SLOT.w, GAME_SLOT.h, 10);
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  renderSteamLogImage,
  formatLimit,
  formatBalance,
  formatInventory,
  formatLevel,
  formatLastActive,
  pickPrimaryGame,
};
