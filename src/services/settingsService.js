const AppSettings = require("../models/AppSettings");
const User = require("../models/User");

const GLOBAL_PERCENT_KEY = "globalWorkerPercent";
const DISPLAY_CURRENCY_KEY = "displayCurrency";
const USD_RUB_RATE_KEY = "usdRubRate";
async function getGlobalWorkerPercent(defaultValue = 80) {
  const row = await AppSettings.findOne({ key: GLOBAL_PERCENT_KEY });
  if (!row || typeof row.valueNumber !== "number") return defaultValue;
  return row.valueNumber;
}

async function setGlobalWorkerPercent(percent) {
  const normalized = Math.max(1, Math.min(100, Number(percent)));
  await AppSettings.findOneAndUpdate(
    { key: GLOBAL_PERCENT_KEY },
    { valueNumber: normalized },
    { upsert: true, new: true }
  );
  await User.updateMany({}, { profitPercent: normalized });
  return normalized;
}

async function getDisplayCurrency(defaultValue = "USD") {
  const row = await AppSettings.findOne({ key: DISPLAY_CURRENCY_KEY });
  const v = String(row?.valueString || defaultValue).toUpperCase();
  return v === "RUB" ? "RUB" : "USD";
}

async function setDisplayCurrency(currency) {
  const next = String(currency || "").toUpperCase() === "RUB" ? "RUB" : "USD";
  await AppSettings.findOneAndUpdate(
    { key: DISPLAY_CURRENCY_KEY },
    { valueString: next },
    { upsert: true, new: true }
  );
  return next;
}

async function toggleDisplayCurrency() {
  const current = await getDisplayCurrency("USD");
  return setDisplayCurrency(current === "RUB" ? "USD" : "RUB");
}

async function getUsdRubRate(defaultValue = 90) {
  const row = await AppSettings.findOne({ key: USD_RUB_RATE_KEY });
  if (!row || typeof row.valueNumber !== "number" || row.valueNumber <= 0) {
    return defaultValue;
  }
  return row.valueNumber;
}

async function setUsdRubRate(rate) {
  const normalized = Math.max(0.01, Number(rate));
  if (!Number.isFinite(normalized)) {
    throw new Error("Некорректный курс");
  }
  await AppSettings.findOneAndUpdate(
    { key: USD_RUB_RATE_KEY },
    { valueNumber: normalized },
    { upsert: true, new: true }
  );
  return normalized;
}

module.exports = {
  getGlobalWorkerPercent,
  setGlobalWorkerPercent,
  getDisplayCurrency,
  setDisplayCurrency,
  toggleDisplayCurrency,
  getUsdRubRate,
  setUsdRubRate,
};
