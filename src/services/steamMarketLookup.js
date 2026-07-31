const axios = require("axios");
const { tryParseLegacySkinLine } = require("../utils/fakeSteamProfitInput");

const headers = { "User-Agent": "Mozilla/5.0", Accept: "application/json, text/javascript, */*;q=0.01" };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parsePrice(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isRateLimited(error) {
  return error?.response?.status === 429 || /status code 429/i.test(String(error?.message || ""));
}

async function steamGet(url, params, timeout = 25000) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt > 0) await sleep(2000 * attempt);
      return (await axios.get(url, { params, headers, timeout })).data;
    } catch (error) {
      lastError = error;
      if (!isRateLimited(error)) throw error;
    }
  }
  throw lastError;
}

async function resolveSkinLine(line, index) {
  const legacy = tryParseLegacySkinLine(line);
  if (legacy) return { item: legacy };
  try {
    await sleep(1200);
    const data = await steamGet("https://steamcommunity.com/market/search/render/", {
      query: line, start: 0, count: 10, norender: 1, appid: 730, currency: 1, language: "english",
    });
    const item = data?.results?.[0];
    const name = item?.hash_name || item?.asset_description?.market_hash_name;
    const icon = item?.asset_description?.icon_url;
    if (!name || !icon) return { error: `Строка ${index}: предмет не найден на Steam Market.` };
    await sleep(1200);
    const priceData = await steamGet("https://steamcommunity.com/market/priceoverview/", {
      appid: 730, currency: 1, market_hash_name: name,
    }, 20000);
    const price = parsePrice(priceData?.lowest_price) ?? parsePrice(priceData?.median_price);
    if (price == null) return { error: `Строка ${index}: нет активных лотов для «${name}».` };
    return { item: { icon: String(icon).replace(/\/\d+fx\d+f$/i, ""), price, itemHashName: name } };
  } catch (error) {
    if (isRateLimited(error)) {
      return {
        error: "Steam Market временно ограничил запросы (429). Подождите 1–2 минуты или используйте формат: иконка;цена;название",
      };
    }
    return { error: `Строка ${index}: ${error.message}` };
  }
}

async function resolveFakeProfitSevenSkinQueries(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 7) return { error: `Нужно ровно 7 непустых строк. Сейчас: ${lines.length}.` };
  const items = [];
  for (let index = 0; index < lines.length; index += 1) {
    const resolved = await resolveSkinLine(lines[index], index + 1);
    if (resolved.error) return resolved;
    items.push(resolved.item);
  }
  return { items, total: Number(items.reduce((sum, item) => sum + item.price, 0).toFixed(2)) };
}

module.exports = { resolveFakeProfitSevenSkinQueries };
