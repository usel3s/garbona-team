const path = require("path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const WIDTH = 1672;
const HEIGHT = 941;
const ASSETS_DIR = path.join(__dirname, "../../assets/profile");

/**
 * Центр колонки значений (свободная зона справа от лейблов).
 * Y — baseline для font 52px.
 */
const VALUE_CENTER = 1080;
const SLOTS = {
  days: { y: 348 },
  nickname: { y: 460 },
  count: { y: 572 },
  total: { y: 684 },
  max: { y: 796 },
};

const FONT = "bold 52px Arial";

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function shorten(text, max = 18) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function drawShadowed(ctx, text, x, y, fillStyle) {
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillText(String(text), x + 2, y + 2);
  ctx.fillStyle = fillStyle;
  ctx.fillText(String(text), x, y);
}

function drawPlain(ctx, text, y) {
  drawShadowed(ctx, text, VALUE_CENTER, y, "#FFFFFF");
}

function drawMoney(ctx, amount, y) {
  const amountText = formatMoney(amount);
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const amountWidth = ctx.measureText(amountText).width;
  const dollarWidth = ctx.measureText("$").width;
  const totalWidth = dollarWidth + amountWidth;
  const left = VALUE_CENTER - totalWidth / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillText("$", left + 2, y + 2);
  ctx.fillText(amountText, left + dollarWidth + 2, y + 2);

  const gradient = ctx.createLinearGradient(left, y - 40, left + 36, y + 8);
  gradient.addColorStop(0, "#59CD53");
  gradient.addColorStop(1, "#28AD82");
  ctx.fillStyle = gradient;
  ctx.fillText("$", left, y);

  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(amountText, left + dollarWidth, y);
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

  const days = Math.max(0, Number(data?.days) || 0);
  const nickname = shorten(data?.nickname || "—", 16);
  const count = Math.max(0, Number(data?.count) || 0);
  const totalShare = Number(data?.totalShare) || 0;
  const maxShare = Number(data?.maxShare) || 0;

  drawPlain(ctx, String(days), SLOTS.days.y);
  drawPlain(ctx, nickname, SLOTS.nickname.y);
  drawPlain(ctx, String(count), SLOTS.count.y);
  drawMoney(ctx, totalShare, SLOTS.total.y);
  drawMoney(ctx, maxShare, SLOTS.max.y);

  return canvas.toBuffer("image/png");
}

module.exports = { renderProfileImage, formatMoney };
