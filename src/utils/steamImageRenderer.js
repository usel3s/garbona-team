const path = require("path");
const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1672;
const HEIGHT = 941;
const ASSETS_DIR = path.join(__dirname, "../../assets/steam-profit");
const CARD_SLOTS = [
  { iconX: 105, iconY: 384, textX: 107 },
  { iconX: 321, iconY: 378, textX: 323 },
  { iconX: 545, iconY: 384, textX: 544 },
  { iconX: 761, iconY: 384, textX: 760 },
  { iconX: 977, iconY: 378, textX: 980 },
  { iconX: 1193, iconY: 378, textX: 1196 },
  { iconX: 1409, iconY: 378, textX: 1414 },
];
const ICON_SIZE = 150;
const STEAM_ICON_HOSTS = [
  "https://steamcommunity-a.akamaihd.net/economy/image/",
  "https://community.steamstatic.com/economy/image/",
  "https://community.cloudflare.steamstatic.com/economy/image/",
];
const WEAR_SUFFIXES = [
  "Factory New",
  "Minimal Wear",
  "Field-Tested",
  "Well-Worn",
  "Battle-Scarred",
];
const IMAGE_HEADERS = { "User-Agent": "Mozilla/5.0", Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" };

function normalizeSteamIconHash(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.match(/economy\/image\/([^/?#]+)/i)?.[1] || value.replace(/\/\d+fx\d+f$/i, "");
}

function looksLikeSteamIconHash(hash) {
  const value = String(hash || "").trim();
  if (!value || /^https?:\/\//i.test(value)) return false;
  // Real Steam economy hashes are long; short placeholders must not block name lookup.
  return value.length >= 40 || value.startsWith("-9a81");
}

function shorten(text, max = 18) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

function parseItemName(hashName) {
  let name = String(hashName || "Unknown item").replace(/^★\s*/, "").trim();
  name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const parts = name.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { weapon: parts[0], skin: parts.slice(1).join(" | ") };
  }
  return { weapon: name || "Unknown", skin: "" };
}

function itemDisplayName(item) {
  return item.itemHashName || item.market_hash_name || item.hash_name || item.name || "";
}

function buildMarketNameVariants(rawName) {
  const name = String(rawName || "").trim();
  if (!name) return [];
  const variants = [];
  const seen = new Set();
  const push = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    variants.push(normalized);
  };

  const withStar = name.startsWith("★") ? name : `★ ${name}`;
  const withoutStar = name.replace(/^★\s*/, "");
  const hasWear = /\([^)]+\)$/.test(name);
  const bases = [name, withStar, withoutStar]
    .map((value) => value.replace(/\s*\([^)]*\)\s*$/, "").trim())
    .filter(Boolean);

  if (hasWear) {
    push(name);
    push(withStar);
    push(withoutStar);
  }
  for (const wear of WEAR_SUFFIXES) {
    for (const base of bases) push(`${base} (${wear})`);
  }
  for (const base of bases) push(base);
  return variants;
}

function buildIconCandidateUrls(item) {
  const urls = [];
  const raw = item.icon || item.icon_url || item.iconUrl || item.image || "";
  const hash = normalizeSteamIconHash(raw);

  // Сначала иконка из uProject (полный URL или economy hash → Steam CDN).
  if (/^https?:\/\//i.test(String(raw))) {
    urls.push(String(raw).trim());
  }
  if (looksLikeSteamIconHash(hash)) {
    for (const host of STEAM_ICON_HOSTS) {
      for (const size of ["", "/360fx360f", "/180fx180f"]) {
        urls.push(`${host}${hash}${size}`);
      }
    }
  }

  // Fallback по имени, если hash из API недоступен.
  for (const variant of buildMarketNameVariants(itemDisplayName(item))) {
    urls.push(`https://api.steamapis.com/image/item/730/${encodeURIComponent(variant)}`);
  }

  return [...new Set(urls.filter(Boolean))];
}

async function fetchImageBuffer(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 8000,
    headers: IMAGE_HEADERS,
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const buffer = Buffer.from(response.data || []);
  const contentType = String(response.headers["content-type"] || "");
  if (buffer.length < 256 || !contentType.includes("image")) {
    throw new Error("Not an image");
  }
  return buffer;
}

async function loadSteamIcon(item) {
  for (const url of buildIconCandidateUrls(item)) {
    try {
      return await loadImage(await fetchImageBuffer(url));
    } catch (_) { /* try next candidate */ }
  }
  return null;
}

function drawMoney(ctx, amount, x, y) {
  const dollars = `$${formatMoney(amount)}`;
  ctx.font = "500 40px sans-serif";
  const gradient = ctx.createLinearGradient(x, y - 30, x + 28, y + 10);
  gradient.addColorStop(0, "rgba(89, 205, 83, 0.95)");
  gradient.addColorStop(1, "rgba(40, 173, 130, 0.95)");
  ctx.fillStyle = gradient;
  ctx.fillText("$", x, y);
  const dollarWidth = ctx.measureText("$").width;
  ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
  ctx.fillText(dollars.slice(1), x + dollarWidth, y);
}

function createAccentGradient(ctx, x, y, size) {
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, "#59CD53");
  gradient.addColorStop(1, "#28AD82");
  return gradient;
}

function drawShareIcon(ctx, x, y, size = 94) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const stroke = createAccentGradient(ctx, x, y, size);

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = Math.max(2.5, size * 0.045);
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();

  const notchR = size * 0.34;
  const notchLen = size * 0.07;
  for (let i = 0; i < 4; i += 1) {
    const angle = (Math.PI / 2) * i - Math.PI / 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(cx + dx * (notchR - notchLen), cy + dy * (notchR - notchLen));
    ctx.lineTo(cx + dx * (notchR + notchLen * 0.35), cy + dy * (notchR + notchLen * 0.35));
    ctx.stroke();
  }

  ctx.font = `600 ${Math.round(size * 0.38)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", cx, cy + size * 0.02);
  ctx.restore();
}

function drawIcon(ctx, image, x, y, size) {
  ctx.drawImage(image, x, y, size, size);
}

async function renderSteamProfitImage({ items = [], total = 0, workerShare = 0 }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  try {
    const bg = await loadImage(path.join(ASSETS_DIR, "bg.png"));
    ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
  } catch (_) {
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const slots = Math.min(items.length, CARD_SLOTS.length);
  const icons = await Promise.all(
    Array.from({ length: slots }, (_, index) => loadSteamIcon(items[index]))
  );

  for (let index = 0; index < slots; index += 1) {
    const item = items[index];
    const slot = CARD_SLOTS[index];
    const { weapon, skin } = parseItemName(itemDisplayName(item));
    const icon = icons[index];

    if (icon) drawIcon(ctx, icon, slot.iconX, slot.iconY, ICON_SIZE);

    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.font = "500 19px sans-serif";
    ctx.fillText(shorten(weapon, 16), slot.textX, 575);

    ctx.fillStyle = "rgba(7, 210, 44, 0.8)";
    ctx.font = "500 14px sans-serif";
    ctx.fillText(shorten(skin || "—", 18), slot.textX, 595);

    ctx.fillStyle = "rgba(255, 255, 255, 0.94)";
    ctx.font = "500 19px sans-serif";
    ctx.fillText(`$${formatMoney(item.price)}`, slot.textX, 642);
  }

  try {
    const wallet = await loadImage(path.join(ASSETS_DIR, "wallet.png"));
    ctx.drawImage(wallet, 387, 751, 99, 97);
  } catch (_) { /* labels still render */ }

  drawShareIcon(ctx, 853, 756, 90);

  ctx.fillStyle = "rgba(180, 190, 200, 0.85)";
  ctx.font = "500 18px sans-serif";
  ctx.fillText("СТОИМОСТЬ ИНВЕНТАРЯ", 514, 778);
  ctx.fillText("ВАША СУММА", 970, 778);

  drawMoney(ctx, total, 517, 838);
  drawMoney(ctx, workerShare, 977, 838);

  return canvas.toBuffer("image/png");
}

module.exports = { renderSteamProfitImage, parseItemName, formatMoney, loadSteamIcon };
