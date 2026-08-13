const { env } = require("../config/env");

/** Публичный URL Worker App (Telegram Mini App). */
function workerPanelAppUrl() {
  const base = String(env.panelPublicUrl || "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/app/`;
}

/** Публичный URL админ-панели. */
function adminPanelUrl() {
  const base = String(env.panelPublicUrl || "").replace(/\/$/, "");
  return base ? `${base}/` : "";
}

module.exports = {
  workerPanelAppUrl,
  adminPanelUrl,
};
