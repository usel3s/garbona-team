const { listDomains } = require("./adminSitesService");
const {
  listActivePanelNotifications,
  panelNotificationToAlert,
} = require("./panelNotificationService");

const NEW_USER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORED_IDS = 300;

function capIds(ids) {
  return [...new Set((ids || []).map(String))].slice(-MAX_STORED_IDS);
}

function buildAlertsFromDomains(domains) {
  const alerts = [];
  for (const domain of domains || []) {
    const domainName = String(domain.domain || domain.id || "domain");
    if (domain.isPaused) {
      alerts.push({
        id: `paused:${domain.id}`,
        type: "paused",
        severity: "warn",
        title: domainName,
        message: "Домен на паузе — ссылки не работают",
        domainId: domain.id,
        createdAt: domain.updatedAt || domain.createdAt || null,
      });
    }
    const checks = domain.banChecks || {};
    for (const key of ["google", "cloudflare", "whois", "yandex", "steam"]) {
      if (checks[key]?.banned) {
        alerts.push({
          id: `ban:${domain.id}:${key}`,
          type: "ban",
          severity: "danger",
          title: domainName,
          message: `Бан: ${key}`,
          domainId: domain.id,
          banType: key,
          createdAt: checks.updatedAt || domain.updatedAt || null,
        });
      }
    }
  }

  alerts.sort((a, b) => {
    const severityRank = { danger: 0, warn: 1, info: 2 };
    const sa = severityRank[a.severity] ?? 9;
    const sb = severityRank[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  return alerts;
}

function isNewWorker(user) {
  const created = user?.createdAt ? new Date(user.createdAt).getTime() : 0;
  if (!Number.isFinite(created) || created <= 0) return true;
  return Date.now() - created < NEW_USER_MS;
}

async function bootstrapAlertsIfNeeded(user, alerts) {
  if (user.panelAlertsBootstrapped) return user;
  user.panelAlertsBootstrapped = true;
  if (isNewWorker(user) && alerts.length) {
    const hidden = capIds([...(user.panelHiddenAlertIds || []), ...alerts.map((a) => a.id)]);
    user.panelHiddenAlertIds = hidden;
  }
  await user.save();
  return user;
}

function serializeAlertsForUser(user, alerts) {
  const hidden = new Set((user.panelHiddenAlertIds || []).map(String));
  const read = new Set((user.panelReadAlertIds || []).map(String));
  return (alerts || [])
    .filter((item) => !hidden.has(String(item.id)))
    .map((item) => ({
      ...item,
      read: read.has(String(item.id)),
    }));
}

async function getWorkerAlerts(user) {
  const payload = await listDomains(user, { light: true });
  const domainAlerts = buildAlertsFromDomains(payload?.domains || []);
  const panelRows = await listActivePanelNotifications(50);
  const panelAlerts = panelRows.map(panelNotificationToAlert);
  const alerts = [...panelAlerts, ...domainAlerts];

  alerts.sort((a, b) => {
    const severityRank = { danger: 0, warn: 1, info: 2 };
    const sa = severityRank[a.severity] ?? 9;
    const sb = severityRank[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  await bootstrapAlertsIfNeeded(user, alerts);
  return serializeAlertsForUser(user, alerts);
}

async function markWorkerAlertsRead(user, ids) {
  const incoming = capIds(ids);
  if (!incoming.length) return user;
  user.panelReadAlertIds = capIds([...(user.panelReadAlertIds || []), ...incoming]);
  await user.save();
  return user;
}

module.exports = {
  getWorkerAlerts,
  markWorkerAlertsRead,
  buildAlertsFromDomains,
};
