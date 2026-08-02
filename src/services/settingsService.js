const AppSettings = require("../models/AppSettings");
const User = require("../models/User");

const GLOBAL_PERCENT_KEY = "globalWorkerPercent";
const DISPLAY_CURRENCY_KEY = "displayCurrency";
const USD_RUB_RATE_KEY = "usdRubRate";
const VISIBLE_TEMPLATES_KEY = "visibleTemplates";

function normalizeTemplateId(value) {
  const id = Math.trunc(Number(value));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function normalizeVisibleTemplate(row) {
  const id = normalizeTemplateId(row?.id ?? row);
  if (!id) return null;
  return {
    id,
    name: String(row?.name || `Template #${id}`).trim() || `Template #${id}`,
    preview: String(row?.preview || "").trim(),
  };
}

async function getVisibleTemplates() {
  const row = await AppSettings.findOne({ key: VISIBLE_TEMPLATES_KEY });
  if (!row?.valueString) return [];
  try {
    const parsed = JSON.parse(row.valueString);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const result = [];
    for (const item of parsed) {
      const tpl = normalizeVisibleTemplate(item);
      if (!tpl || seen.has(tpl.id)) continue;
      seen.add(tpl.id);
      result.push(tpl);
    }
    return result;
  } catch {
    return [];
  }
}

async function setVisibleTemplates(templates) {
  const normalized = [];
  const seen = new Set();
  for (const item of templates || []) {
    const tpl = normalizeVisibleTemplate(item);
    if (!tpl || seen.has(tpl.id)) continue;
    seen.add(tpl.id);
    normalized.push(tpl);
  }
  await AppSettings.findOneAndUpdate(
    { key: VISIBLE_TEMPLATES_KEY },
    { valueString: JSON.stringify(normalized) },
    { upsert: true, new: true }
  );
  return normalized;
}

async function addVisibleTemplate(template) {
  const tpl = normalizeVisibleTemplate(template);
  if (!tpl) throw new Error("Некорректный ID шаблона");
  const current = await getVisibleTemplates();
  const idx = current.findIndex((row) => row.id === tpl.id);
  if (idx >= 0) current[idx] = { ...current[idx], ...tpl };
  else current.push(tpl);
  return setVisibleTemplates(current);
}

async function removeVisibleTemplate(templateId) {
  const id = normalizeTemplateId(templateId);
  if (!id) throw new Error("Некорректный ID шаблона");
  const current = await getVisibleTemplates();
  return setVisibleTemplates(current.filter((row) => row.id !== id));
}

async function renameVisibleTemplate(templateId, name) {
  const id = normalizeTemplateId(templateId);
  if (!id) throw new Error("Некорректный ID шаблона");
  const customName = String(name || "").trim().slice(0, 80);
  if (!customName) throw new Error("Укажите название шаблона");
  const current = await getVisibleTemplates();
  const idx = current.findIndex((row) => row.id === id);
  if (idx < 0) throw new Error("Шаблон не включён");
  current[idx] = { ...current[idx], name: customName };
  return setVisibleTemplates(current);
}

async function isTemplateVisible(templateId) {
  const id = normalizeTemplateId(templateId);
  if (!id) return false;
  const current = await getVisibleTemplates();
  return current.some((row) => row.id === id);
}

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
  getVisibleTemplates,
  setVisibleTemplates,
  addVisibleTemplate,
  removeVisibleTemplate,
  renameVisibleTemplate,
  isTemplateVisible,
  normalizeTemplateId,
};
