const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1672;
const HEIGHT = 941;
const ASSETS_DIR = path.join(__dirname, "../../assets/profile");

/** Слоты значений относительно макета Figma node 431:3 */
const SLOTS = {
  days: { x: 1139, y: 301 + 46 },
  nickname: { x: 1121, y: 413 + 46 },
  count: { x: 1134, y: 525 + 46 },
  total: { x: 1073, y: 637 + 46 },
  max: { x: 1073, y: 749 + 46 },
};

const FONT = "600 48px sans-serif";
const WHITE = "rgba(255, 255, 255, 0.96)";

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function shorten(text, max = 18) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function drawPlain(ctx, text, x, y) {
  ctx.fillStyle = WHITE;
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(text), x, y);
}

function drawMoney(ctx, amount, x, y) {
  const dollars = `$${formatMoney(amount)}`;
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const gradient = ctx.createLinearGradient(x, y - 36, x + 32, y + 8);
  gradient.addColorStop(0, "rgba(89, 205, 83, 0.92)");
  gradient.addColorStop(1, "rgba(40, 173, 130, 0.92)");
  ctx.fillStyle = gradient;
  ctx.fillText("$", x, y);

  const dollarWidth = ctx.measureText("$").width;
  ctx.fillStyle = WHITE;
  ctx.fillText(dollars.slice(1), x + dollarWidth, y);
}

/**
 * Карточка профиля по макету Figma (1672×941).
 * @param {{ days: number, nickname: string, count: number, totalShare: number, maxShare: number }} data
 */
async function renderProfileImage(data) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  try {
    const bg = await loadImage(path.join(ASSETS_DIR, "bg.png"));
    ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT);
  } catch (_) {
    ctx.fillStyle = "#05070c";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  drawPlain(ctx, String(Math.max(0, Number(data.days) || 0)), SLOTS.days.x, SLOTS.days.y);
  drawPlain(ctx, shorten(data.nickname || "—", 16), SLOTS.nickname.x, SLOTS.nickname.y);
  drawPlain(ctx, String(Math.max(0, Number(data.count) || 0)), SLOTS.count.x, SLOTS.count.y);
  drawMoney(ctx, data.totalShare, SLOTS.total.x, SLOTS.total.y);
  drawMoney(ctx, data.maxShare, SLOTS.max.x, SLOTS.max.y);

  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileImage, formatMoney };
