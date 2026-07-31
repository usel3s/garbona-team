function normalizeSteamIconHash(input) {
  const value = String(input || "").trim();
  return value.match(/economy\/image\/([^/?#]+)/i)?.[1] || value;
}
function tryParseLegacySkinLine(line) {
  const parts = String(line || "").trim().split(";");
  if (parts.length < 3 || !/^\d+([.,]\d+)?$/.test(parts[1].trim())) return null;
  const icon = normalizeSteamIconHash(parts[0]);
  const price = Number(parts[1].replace(",", "."));
  if (!icon || !Number.isFinite(price) || price < 0) return null;
  return { icon, price, itemHashName: parts.slice(2).join(";").trim() || "Unknown item" };
}
const FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML = [
  "<b>Фейк-профит</b>", "", "Отправьте <b>7 строк</b> — по одному скину на строку.",
  "", "Укажите точное имя скина как на Steam Market CS2.", "",
  "Также доступен ручной формат:", "<code>хеш_или_URL_иконки;цена;название</code>",
].join("\n");

module.exports = { normalizeSteamIconHash, tryParseLegacySkinLine, FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML };
