const {
  rulesAcceptKeyboard,
  profileKeyboard,
  aboutProjectKeyboard,
  aboutRulesBackKeyboard,
  settingsKeyboard,
  settingsCancelKeyboard,
  walletKeyboard,
  profitsKeyboard,
  walletAmountCancelKeyboard,
  withdrawMethodKeyboard,
  payoutModerationKeyboard,
  homeOnlyKeyboard,
  steamLogSellPendingKeyboard,
} = require("../keyboards/common");
const {
  adminPanelKeyboard,
  adminCommsKeyboard,
  adminEconomyKeyboard,
  adminCurrencyKeyboard,
  adminStatsKeyboard,
  adminLogsKeyboard,
  adminBotLogsKeyboard,
  memberActionKeyboard,
  memberPanelAccountKeyboard,
  memberPanelRecreateConfirmKeyboard,
  adminCancelKeyboard,
  adminResultKeyboard,
} = require("../keyboards/admin");
const { renderHome } = require("../commands/start");
const {
  renderTopWorkers,
  renderPublicProfile,
} = require("../commands/top");
const {
  ensureUser,
  isAdminTelegramId,
  setBan,
  setTeamMember,
  setCurator,
  setCaller,
  setModerator,
  getUserByTelegramId,
  listCurators,
  listCallers,
  toggleAnonymous,
} = require("../services/userService");
const {
  getUserProfitStatsByTelegramId,
  getProfitDashboard,
} = require("../services/profitService");
const {
  getAvailableUsd,
  hasPendingRequest,
  createWithdrawalRequest,
  setAwaitingPayoutLink,
  rejectPayout,
  buildChannelMessageHtml,
  buildWithdrawConfirmHtml,
  buildRejectedChannelSuffix,
  attachChannelMeta,
  resetPendingApproval,
  methodLabel,
  calcPayoutBreakdown,
} = require("../services/withdrawalService");
const {
  decideApplication,
  formatApplicationCard,
  getApplicationById,
  getApplicationSubmitGate,
  listApplications,
  buildDecisionChannelMarkup,
} = require("../services/applicationService");
const { getForm, removeFormQuestion } = require("../services/formService");
const {
  adminAppsHubKeyboard,
  adminAppsListKeyboard,
  adminAppViewKeyboard,
  adminAppRejectConfirmKeyboard,
  adminQuestionsKeyboard,
  adminQuestionDeleteConfirmKeyboard,
} = require("../keyboards/application");
const { env } = require("../config/env");
const { getProjectRulesLines } = require("../config/projectRules");
const { logger, getRecentLogsText, DEFAULT_EXPORT_LINES } = require("../utils/logger");
const { upsertBotMessage, upsertBotPhoto } = require("../utils/message");
const { pe, btn } = require("../utils/emoji");
const { formatMemberCardHtml } = require("../utils/adminMemberCard");
const { clearPendingInputs } = require("../utils/session");
const { renderProfileImage } = require("../utils/profileImageRenderer");
const ProfitTransaction = require("../models/ProfitTransaction");
const User = require("../models/User");
const {
  getGlobalWorkerPercent,
  getDisplayCurrency,
  setDisplayCurrency,
  getUsdRubRate,
} = require("../services/settingsService");
const { disableTemplateById } = require("../services/adminSitesService");
const { buildAdminTemplatesView } = require("../utils/adminTemplatesUi");
const {
  getCurrencyContext,
  formatDisplayAmount,
} = require("../services/currencyService");
const { seedManualsThread, manualsChatId } = require("../services/manualsThreadService");
const {
  publishLaunchAnnounce,
  launchAnnounceChatId,
} = require("../services/launchAnnounceService");
const {
  publishChangelog,
  changelogsChatId,
} = require("../services/changelogService");
const {
  publishOrRefreshDynamicPin,
  dynamicPinChatId,
} = require("../services/dynamicPinService");
const { authCredentials, getTeamWorkers, formatPanelError } = require("../services/apiService");
const {
  ensureWorkerPanelAccount,
  recreateWorkerPanelAccount,
} = require("../services/panelAccountService");
const { getAdminDashboardStats } = require("../services/adminStatsService");
const { FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML } = require("../utils/fakeSteamProfitInput");
const { submitLogSaleRequest } = require("../services/steamMonitorService");
const SteamLog = require("../models/SteamLog");
const { curatorsIntroHtml, curatorsIntroKeyboard } = require("../utils/curatorsUi");
const { callersIntroHtml, callersIntroKeyboard } = require("../utils/callersUi");
const {
  createCuratorApplication,
  acceptCuratorApplication,
  rejectCuratorApplication,
  curatorApplicationModerationKeyboard,
  buildCuratorApplicationNotifyHtml,
  updateCuratorSettings,
  buildCuratorCardHtml,
} = require("../services/curatorService");
const { updateCallerSettings, buildCallerCardHtml } = require("../services/callerService");
const { Markup } = require("telegraf");

function requireAdmin(ctx) {
  if (!isAdminTelegramId(ctx.from.id)) {
    // fire-and-forget; patched answerCbQuery never throws
    Promise.resolve(ctx.answerCbQuery("Недостаточно прав", { show_alert: true })).catch(
      () => {}
    );
    return false;
  }
  return true;
}

function periodLabel(period) {
  const map = {
    all: "за всё время",
    "24h": "за 24 часа",
    "7d": "за 7 дней",
    "30d": "за 30 дней",
  };
  return map[period] || map.all;
}

async function renderAdminPanel(ctx) {
  const [globalPercent, currency, rate] = await Promise.all([
    getGlobalWorkerPercent(80),
    getDisplayCurrency("USD"),
    getUsdRubRate(90),
  ]);
  const currencyLabel = currency === "RUB" ? "₽ RUB" : "$ USD";
  await upsertBotMessage(
    ctx,
    [
      `${pe("code")} <b>Админ-панель</b>`,
      "",
      `<i>${currencyLabel} · курс ${rate} · ${globalPercent}%</i>`,
    ].join("\n"),
    { reply_markup: adminPanelKeyboard().reply_markup }
  );
}

async function renderAdminUsers(ctx) {
  ctx.session.adminInput = { type: "search_user" };
  await upsertBotMessage(
    ctx,
    [
      `${pe("users")} <b>Участники</b>`,
      "",
      "Введите <b>@username</b> или Telegram <b>ID</b> пользователя.",
    ].join("\n"),
    { reply_markup: adminCancelKeyboard("admin:panel").reply_markup }
  );
}

async function renderAdminComms(ctx) {
  await upsertBotMessage(
    ctx,
    [
      `${pe("broadcast")} <b>Коммуникация</b>`,
      "",
      "Рассылка команде и конструктор постов.",
    ].join("\n"),
    { reply_markup: adminCommsKeyboard().reply_markup }
  );
}

async function renderAdminEconomy(ctx) {
  const [globalPercent, currency, rate] = await Promise.all([
    getGlobalWorkerPercent(80),
    getDisplayCurrency("USD"),
    getUsdRubRate(90),
  ]);
  await upsertBotMessage(
    ctx,
    [
      `${pe("coins")} <b>Экономика</b>`,
      "",
      `Валюта отображения: <b>${currency === "RUB" ? "RUB" : "USD"}</b>`,
      `Курс: <b>1 USD = ${rate} RUB</b>`,
      `Глобальный % воркера: <b>${globalPercent}%</b>`,
    ].join("\n"),
    { reply_markup: adminEconomyKeyboard(globalPercent, currency).reply_markup }
  );
}

async function renderAdminTemplates(ctx) {
  const view = await buildAdminTemplatesView();
  await upsertBotMessage(ctx, view.text, { reply_markup: view.reply_markup });
}

async function renderAdminCurrency(ctx) {
  const currency = await getDisplayCurrency("USD");
  await upsertBotMessage(
    ctx,
    [
      `${pe("coins")} <b>Валюта отображения</b>`,
      "",
      `Сейчас: <b>${currency === "RUB" ? "RUB (₽)" : "USD ($)"}</b>`,
      "Выберите валюту для сумм в боте.",
    ].join("\n"),
    { reply_markup: adminCurrencyKeyboard(currency).reply_markup }
  );
}

async function renderAdminStats(ctx, period = "all") {
  const [dash, currencyCtx] = await Promise.all([
    getAdminDashboardStats(period),
    getCurrencyContext(),
  ]);
  const apps = dash.applications;
  const profits = dash.profits;

  await upsertBotMessage(
    ctx,
    [
      `${pe("statistics")} <b>Статистика</b>`,
      `Период: <b>${dash.periodLabel}</b>`,
      "",
      `${pe("notification")} <b>Заявки</b>`,
      ` ┖ Всего: <b>${apps.total}</b>`,
      ` ┖ Принято: <b>${apps.accepted}</b>`,
      ` ┖ Отклонено: <b>${apps.rejected}</b>`,
      ` ┖ На рассмотрении: <b>${apps.pending}</b>`,
      ` ┖ Сейчас в очереди: <b>${dash.pendingNow}</b>`,
      "",
      `${pe("coins")} <b>Профиты</b>`,
      ` ┖ Начислено: <b>${profits.count}</b>`,
      ` ┖ Сумма: <b>${formatDisplayAmount(profits.totalProfit, currencyCtx)}</b>`,
      "",
      `${pe("users")} Участников в команде: <b>${dash.teamCount}</b>`,
    ].join("\n"),
    { reply_markup: adminStatsKeyboard(period).reply_markup }
  );
}

async function renderAdminAppsHub(ctx) {
  const { total: pendingNow } = await listApplications({ status: "pending", page: 0 });
  await upsertBotMessage(
    ctx,
    [
      `${pe("notification")} <b>Управление заявками</b>`,
      "",
      `Сейчас в очереди: <b>${pendingNow}</b>`,
      "Просмотр заявок (в т.ч. без канала) и настройка вопросов формы.",
    ].join("\n"),
    { reply_markup: adminAppsHubKeyboard().reply_markup }
  );
}

async function renderAdminAppsList(ctx, kind, page = 0) {
  const isPending = kind === "pending";
  const result = await listApplications({
    status: isPending ? "pending" : undefined,
    statuses: isPending ? undefined : ["accepted", "rejected"],
    page,
  });

  const title = isPending ? "На рассмотрении" : "Закрытые заявки";
  if (!result.total) {
    await upsertBotMessage(
      ctx,
      `${pe("info")} <b>${title}</b>\n\nСписок пуст.`,
      {
        reply_markup: {
          inline_keyboard: [[btn("Назад", "admin:apps", "home")]],
        },
      }
    );
    return;
  }

  await upsertBotMessage(
    ctx,
    [
      `${pe("notification")} <b>${title}</b>`,
      `Всего: <b>${result.total}</b> · стр. ${result.page + 1}/${result.totalPages}`,
      "",
      "Выберите заявку:",
    ].join("\n"),
    {
      reply_markup: adminAppsListKeyboard(
        kind,
        result.page,
        result.totalPages,
        result.items
      ).reply_markup,
    }
  );
}

async function renderAdminAppView(ctx, applicationId, backKind = "pending", backPage = 0) {
  const application = await getApplicationById(applicationId);
  if (!application) {
    await upsertBotMessage(ctx, `${pe("error")} Заявка не найдена.`, {
      reply_markup: adminAppsHubKeyboard().reply_markup,
    });
    return;
  }
  const form = await getForm(application.formId || "teamApplication");
  const text = await formatApplicationCard(application, form);
  const back = `admin:apps:${backKind}:${backPage}`;
  await upsertBotMessage(ctx, text, {
    reply_markup: adminAppViewKeyboard(applicationId, application.status, back).reply_markup,
  });
}

async function renderAdminQuestions(ctx) {
  const form = await getForm("teamApplication");
  const lines = [
    `${pe("edit")} <b>Вопросы формы</b>`,
    "",
    `Всего вопросов: <b>${form.questions.length}</b>`,
    "Нажмите на вопрос, чтобы удалить.",
    "",
  ];
  form.questions.forEach((q, i) => {
    lines.push(`<b>${i + 1}. ${q.label}</b>`);
    lines.push(` ┖ ${q.prompt}`);
  });
  await upsertBotMessage(ctx, lines.join("\n"), {
    reply_markup: adminQuestionsKeyboard(form.questions).reply_markup,
  });
}

async function getProjectProfitStats() {
  const [stats] = await ProfitTransaction.aggregate([
    {
      $group: {
        _id: null,
        totalProfit: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    totalProfit: Number(stats?.totalProfit || 0),
    count: Number(stats?.count || 0),
  };
}

function getAboutInviteSession(ctx) {
  if (!ctx.session.aboutInviteLinks) ctx.session.aboutInviteLinks = {};
  return ctx.session.aboutInviteLinks;
}

async function handleAboutProtectedChannelClick(ctx, channelKey) {
  const map = {
    workers_chat: env.aboutWorkersChatId,
    payouts: env.aboutPayoutsChatId,
    manuals: env.aboutManualsChatId,
  };
  const chatId = map[channelKey];
  if (!chatId) {
    await ctx.answerCbQuery("Канал не настроен", { show_alert: true });
    return;
  }

  try {
    const expireDate = Math.floor(Date.now() / 1000) + 5 * 60;
    const created = await ctx.telegram.createChatInviteLink(chatId, {
      expire_date: expireDate,
      member_limit: 1,
    });

    const invites = getAboutInviteSession(ctx);
    invites[channelKey] = created.invite_link;

    const markup = aboutProjectKeyboard(env.aboutInfoChannelUrl, invites).reply_markup;
    try {
      await ctx.editMessageReplyMarkup(markup);
    } catch (editErr) {
      logger.warn("editMessageReplyMarkup about keyboard failed", editErr?.message || editErr);
    }

    await ctx.answerCbQuery("нажми кнопку ещё раз");
  } catch (e) {
    const desc = e?.response?.description || e.message || "Не удалось создать ссылку";
    await ctx.answerCbQuery(String(desc).slice(0, 200), { show_alert: true });
  }
}

async function renderProfile(ctx, period = "all") {
  const user = await ensureUser(ctx.from);
  const currencyCtx = await getCurrencyContext();
  let roleLabel = "Пользователь";
  if (user.role === "admin") roleLabel = "Администратор";
  else if (user.isCurator) roleLabel = "Куратор";
  else if (user.isCaller) roleLabel = "Прозвонщица";
  else if (user.isTeamMember) roleLabel = "Воркер";

  const daysWithTeam = Math.max(
    1,
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  const [stats, dash] = await Promise.all([
    getUserProfitStatsByTelegramId(user.telegramId, period),
    getProfitDashboard(user),
  ]);
  const periodProfit = stats ? stats.periodProfit : 0;
  const operationsCount = stats ? stats.operationsCount : 0;

  const lines = [
    `${pe("profile")} <b>Твой профиль</b> [<code>${user.telegramId}</code>]`,
    ` ┖ Статус: ${roleLabel}`,
  ];

  if (user.curatorTelegramId && !user.isCurator) {
    const bound = await getUserByTelegramId(user.curatorTelegramId);
    const curatorLabel = bound?.username
      ? `@${bound.username}`
      : `<code>${user.curatorTelegramId}</code>`;
    lines.push(` ┖ Куратор: ${curatorLabel}`);
  }

  lines.push("");
  lines.push(`${pe("statistics")} <b>Статистика ${periodLabel(period)}:</b>`);

  if (operationsCount > 0) {
    lines.push(` ┖ Профит: ${formatDisplayAmount(periodProfit, currencyCtx)}`);
    lines.push(` ┖ Операций: ${operationsCount}`);
  } else {
    lines.push(" ┖ Профиты отсутствуют.");
  }

  lines.push("");
  lines.push(`О себе: ${user.bio || "Отсутствует"}`);
  lines.push("");
  lines.push(`${pe("calendar")} С нами: ${daysWithTeam} дн.`);

  const caption = lines.join("\n");
  const keyboard = { reply_markup: profileKeyboard(period).reply_markup };

  try {
    const imageBuffer = await renderProfileImage({
      days: dash.days,
      nickname:
        String(ctx.from?.first_name || user.firstName || "").trim() || dash.nickname,
      count: dash.count,
      totalShare: dash.totalShare,
      maxShare: dash.maxShare,
    });
    await upsertBotPhoto(ctx, { source: imageBuffer, filename: "profile.png" }, {
      caption,
      parse_mode: "HTML",
      ...keyboard,
    });
  } catch (error) {
    logger.warn("profile image render failed", error.message);
    await upsertBotMessage(ctx, caption, keyboard);
  }
}

async function renderSettings(ctx) {
  const user = await ensureUser(ctx.from);
  const nickOpen = !user.isAnonymous;
  await upsertBotMessage(
    ctx,
    [
      `${pe("settings")} <b>Настройки</b>`,
      "",
      "<blockquote>Здесь можно настроить своё рабочее пространство</blockquote>",
      "",
      `Ник в профитах: <b>${nickOpen ? "Открыт" : "Скрыт"}</b>`,
    ].join("\n"),
    { reply_markup: settingsKeyboard(nickOpen).reply_markup }
  );
}

function registerCallbackHandlers(bot) {
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery();
    clearPendingInputs(ctx);
    if (ctx.scene?.current) {
      try {
        await ctx.scene.leave();
      } catch (_) {
        /* ignore */
      }
    }
    await renderHome(ctx);
  });

  bot.action("menu:apply", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await ensureUser(ctx.from);
    const gate = await getApplicationSubmitGate(user);
    if (!gate.allowed) {
      await upsertBotMessage(ctx, gate.message, {
        reply_markup: homeOnlyKeyboard().reply_markup,
      });
      return;
    }
    await upsertBotMessage(ctx, getProjectRulesLines().join("\n"), {
      reply_markup: rulesAcceptKeyboard().reply_markup,
    });
  });

  bot.action("app:rules_accept", async (ctx) => {
    const user = await ensureUser(ctx.from);
    const gate = await getApplicationSubmitGate(user);
    if (!gate.allowed) {
      await ctx.answerCbQuery("Подача недоступна", { show_alert: true });
      try {
        await ctx.deleteMessage();
        if (ctx.session?.ui) ctx.session.ui.messageId = null;
      } catch (_) {
        /* ignore */
      }
      await upsertBotMessage(ctx, gate.message, {
        reply_markup: homeOnlyKeyboard().reply_markup,
      });
      return;
    }

    try {
      await ctx.deleteMessage();
      if (ctx.session?.ui) {
        ctx.session.ui.messageId = null;
      }
    } catch (_) {
      // Message may already be deleted; continue flow.
    }
    await ctx.answerCbQuery("Вы приняли правила команды!");
    await ctx.scene.enter("applicationScene");
  });

  bot.action("menu:profile", async (ctx) => {
    await ctx.answerCbQuery();
    clearPendingInputs(ctx);
    await renderProfile(ctx, "all");
  });

  bot.action(/^profile:stats:(all|24h|7d|30d)$/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCbQuery(`Период: ${periodLabel(period)}`);
    await renderProfile(ctx, period);
  });

  bot.action("profile:profits", async (ctx) => {
    await ctx.answerCbQuery();
    const user = await ensureUser(ctx.from);
    const currencyCtx = await getCurrencyContext();
    const dash = await getProfitDashboard(user);

    const lines = [
      `${pe("coins")} <b>Профиты</b>`,
      "",
      `С нами: <b>${dash.days}</b> дн.`,
    ];

    if (dash.count > 0) {
      lines.push(`Всего: <b>${formatDisplayAmount(dash.totalShare, currencyCtx)}</b>`);
      lines.push(`Макс. профит: <b>${formatDisplayAmount(dash.maxShare, currencyCtx)}</b>`);
      lines.push(`Операций: <b>${dash.count}</b>`);
      lines.push("");
      lines.push("Нажмите на кнопку, чтобы посмотреть статистику за период.");
    } else {
      lines.push("");
      lines.push("Профиты отсутствуют. Когда появятся начисления — статистика будет здесь.");
    }

    await upsertBotMessage(ctx, lines.join("\n"), {
      reply_markup: profitsKeyboard().reply_markup,
    });
  });

  bot.action("profile:wallet", async (ctx) => {
    await ctx.answerCbQuery();
    clearPendingInputs(ctx);
    const user = await ensureUser(ctx.from);
    const currencyCtx = await getCurrencyContext();
    const available = await getAvailableUsd(user);
    const minW = env.walletMinWithdrawalUsd;
    const canWithdraw =
      available >= minW && !(await hasPendingRequest(user.telegramId));
    await upsertBotMessage(
      ctx,
      [
        `${pe("wallet")} <b>Кошелёк</b>`,
        "",
        `${pe("coins")} <b>Баланс:</b> ${formatDisplayAmount(available, currencyCtx)}`,
        `${pe("info")} Вывод от ${formatDisplayAmount(minW, currencyCtx)}`,
      ].join("\n"),
      {
        reply_markup: walletKeyboard({ showWithdraw: canWithdraw }).reply_markup,
      }
    );
  });

  bot.action("wallet:withdraw", async (ctx) => {
    const user = await ensureUser(ctx.from);
    const currencyCtx = await getCurrencyContext();
    const available = await getAvailableUsd(user);
    const minW = env.walletMinWithdrawalUsd;
    if (available + 1e-9 < minW) {
      await ctx.answerCbQuery(`Минимум ${formatDisplayAmount(minW, currencyCtx)}`, {
        show_alert: true,
      });
      return;
    }
    if (await hasPendingRequest(user.telegramId)) {
      await ctx.answerCbQuery("Уже есть активная заявка", { show_alert: true });
      return;
    }
    ctx.session.walletWithdraw = { step: "method" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("transfer")} <b>Вывод средств</b>`,
        "",
        `Доступно: <b>${formatDisplayAmount(available, currencyCtx)}</b>`,
        `Минимум: <b>${formatDisplayAmount(minW, currencyCtx)}</b>`,
        "",
        "Выберите сеть для отправки:",
      ].join("\n"),
      {
        reply_markup: withdrawMethodKeyboard().reply_markup,
      }
    );
  });

  bot.action("wallet:history", async (ctx) => {
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("file")} <b>История транзакций</b>`,
        "",
        "Нажмите кнопку ниже и выберите операцию из inline-списка.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Открыть историю",
                switch_inline_query_current_chat: "wallet",
                icon_custom_emoji_id: "5870528606328852614",
              },
            ],
            [{ text: "Назад", callback_data: "profile:wallet", icon_custom_emoji_id: "5769126056262898415" }],
          ],
        },
      }
    );
  });

  bot.action(/^wallet:method:(usdt_trc20|usdt_bep20|ton_gram)$/, async (ctx) => {
    const method = ctx.match[1];
    const user = await ensureUser(ctx.from);
    const st = ctx.session?.walletWithdraw;
    if (!st || st.step !== "method") {
      await ctx.answerCbQuery("Начните вывод заново", { show_alert: true });
      return;
    }
    if (await hasPendingRequest(user.telegramId)) {
      await ctx.answerCbQuery("Уже есть активная заявка", { show_alert: true });
      return;
    }

    ctx.session.walletWithdraw = { step: "address", method };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("wallet")} <b>Адрес кошелька</b>`,
        "",
        `Сеть: <b>${methodLabel(method)}</b>`,
        "",
        "Введите адрес кошелька для получения средств.",
      ].join("\n"),
      { reply_markup: walletAmountCancelKeyboard().reply_markup }
    );
  });

  bot.action("wallet:confirm_send", async (ctx) => {
    const user = await ensureUser(ctx.from);
    const st = ctx.session?.walletWithdraw;
    if (
      !st ||
      st.step !== "confirm" ||
      !st.method ||
      !st.address ||
      !Number.isFinite(Number(st.amount))
    ) {
      await ctx.answerCbQuery("Начните вывод заново", { show_alert: true });
      return;
    }

    const amount = Number(st.amount);
    const method = st.method;
    const address = st.address;
    ctx.session.walletWithdraw = null;

    try {
      const doc = await createWithdrawalRequest(user, amount, method, address);
      const text = buildChannelMessageHtml(doc);
      const msg = await ctx.telegram.sendMessage(env.payoutRequestsChannelId, text, {
        parse_mode: "HTML",
        reply_markup: payoutModerationKeyboard(doc._id.toString()).reply_markup,
      });
      await attachChannelMeta(doc._id, msg.chat.id, msg.message_id);
      await ctx.answerCbQuery("Заявка отправлена");
      const currencyCtx = await getCurrencyContext();
      const { networkFee, payoutAmount } = calcPayoutBreakdown(amount, method);
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Заявка на выплату создана</b>`,
          "",
          `Сеть: ${methodLabel(method)}`,
          `Кошелёк: <code>${address}</code>`,
          `Сумма: ${formatDisplayAmount(amount, currencyCtx)}`,
          `Комиссия сети: ${formatDisplayAmount(networkFee, currencyCtx)}`,
          `К выплате: ${formatDisplayAmount(payoutAmount, currencyCtx)}`,
          "",
          "Ожидайте подтверждения администратора.",
        ].join("\n"),
        {
          reply_markup: walletKeyboard({
            showWithdraw: false,
          }).reply_markup,
        }
      );
    } catch (e) {
      await ctx.answerCbQuery();
      await upsertBotMessage(ctx, `${pe("error")} ${e.message}`, {
        reply_markup: walletKeyboard({ showWithdraw: true }).reply_markup,
      });
    }
  });

  bot.action(/^payout:approve:([a-f0-9]{24})$/i, async (ctx) => {
    if (!isAdminTelegramId(ctx.from.id)) {
      await ctx.answerCbQuery("Нет прав", { show_alert: true });
      return;
    }
    const id = ctx.match[1];
    const updated = await setAwaitingPayoutLink(id, ctx.from.id);
    if (!updated) {
      await ctx.answerCbQuery("Заявка недоступна или уже обработана", { show_alert: true });
      return;
    }
    try {
      const walletLine = updated.walletAddress
        ? `Кошелёк: <code>${updated.walletAddress}</code>`
        : null;
      const breakdown = calcPayoutBreakdown(updated.amountUsd, updated.method);
      await ctx.telegram.sendMessage(
        ctx.from.id,
        [
          `${pe("success")} <b>Одобрение выплаты</b>`,
          "",
          `Заявка: <code>${id}</code>`,
          `Пользователь: @${updated.username || "—"} (<code>${updated.telegramId}</code>)`,
          `Сумма: <b>$${breakdown.amountUsd.toFixed(2)}</b>`,
          `Комиссия сети: <b>$${breakdown.networkFee.toFixed(2)}</b>`,
          `К выплате: <b>$${breakdown.payoutAmount.toFixed(2)}</b>`,
          `Сеть: ${methodLabel(updated.method)}`,
          walletLine,
          "",
          "Пришлите <b>следующим сообщением</b> ссылку на транзакцию (https://…).",
        ]
          .filter(Boolean)
          .join("\n"),
        {
          parse_mode: "HTML",
          reply_markup: adminCancelKeyboard().reply_markup,
        }
      );
      await ctx.answerCbQuery("Отправьте ссылку в ЛС бота");
    } catch (e) {
      await resetPendingApproval(id);
      await ctx.answerCbQuery("Откройте бота в ЛС и нажмите Start", { show_alert: true });
    }
  });

  bot.action(/^payout:reject:([a-f0-9]{24})$/i, async (ctx) => {
    if (!isAdminTelegramId(ctx.from.id)) {
      await ctx.answerCbQuery("Нет прав", { show_alert: true });
      return;
    }
    const id = ctx.match[1];
    const req = await rejectPayout(id, ctx.from.id);
    if (!req) {
      await ctx.answerCbQuery("Заявка недоступна", { show_alert: true });
      return;
    }
    await ctx.answerCbQuery("Выплата отклонена");
    try {
      await ctx.telegram.sendMessage(
        req.telegramId,
        `${pe("error")} Ваша заявка на выплату <b>отклонена</b>.`,
        {
          parse_mode: "HTML",
          reply_markup: homeOnlyKeyboard().reply_markup,
        }
      );
    } catch (_) {
      /* ignore */
    }
    if (req.channelChatId && req.channelMessageId) {
      try {
        const base = buildChannelMessageHtml(req);
        await ctx.telegram.editMessageText(
          req.channelChatId,
          Number(req.channelMessageId),
          undefined,
          base + buildRejectedChannelSuffix(),
          { parse_mode: "HTML", reply_markup: { inline_keyboard: [] } }
        );
      } catch (_) {
        /* ignore */
      }
    }
  });

  bot.action("menu:about", async (ctx) => {
    await ctx.answerCbQuery();
    const projectStats = await getProjectProfitStats();
    const globalPercent = await getGlobalWorkerPercent(80);
    const currencyCtx = await getCurrencyContext();
    await upsertBotMessage(
      ctx,
      [
        `${pe("info")} <b>Информация о проекте Garbona</b>`,
        "└ Дата открытия: 08.04.2026",
        `${pe("lock")} Страховой депозит на Lolz: <b>250$</b>`,
        "",
        `${pe("coins")} Сумма профитов: <b>${formatDisplayAmount(projectStats.totalProfit, currencyCtx)}</b>`,
        `${pe("statistics")} Количество профитов: <b>${projectStats.count}</b>`,
        "",
        `${pe("analytics")} <b>Процент выплат:</b>`,
        `└ Воркеру: ${globalPercent}%`,
      ].join("\n"),
      {
        reply_markup: aboutProjectKeyboard(
          env.aboutInfoChannelUrl,
          ctx.session?.aboutInviteLinks || {}
        ).reply_markup,
      }
    );
  });

  bot.action("menu:curators", async (ctx) => {
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, curatorsIntroHtml(), {
      reply_markup: curatorsIntroKeyboard().reply_markup,
    });
  });

  bot.action("menu:callers", async (ctx) => {
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, callersIntroHtml(), {
      reply_markup: callersIntroKeyboard().reply_markup,
    });
  });

  bot.action("about:workers_chat", async (ctx) => {
    await handleAboutProtectedChannelClick(ctx, "workers_chat");
  });

  bot.action("about:payouts", async (ctx) => {
    await handleAboutProtectedChannelClick(ctx, "payouts");
  });

  bot.action("about:manuals", async (ctx) => {
    await handleAboutProtectedChannelClick(ctx, "manuals");
  });

  bot.action("about:rules", async (ctx) => {
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, getProjectRulesLines().join("\n"), {
      reply_markup: aboutRulesBackKeyboard().reply_markup,
    });
  });

  bot.action("menu:settings", async (ctx) => {
    await ctx.answerCbQuery();
    await renderSettings(ctx);
  });

  bot.action("settings:toggle_nick", async (ctx) => {
    await toggleAnonymous(ctx.from.id);
    await ctx.answerCbQuery("Настройка обновлена");
    await renderSettings(ctx);
  });

  bot.action("settings:add_description", async (ctx) => {
    ctx.session.profileEditBio = true;
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("edit")} Отправь текст для поля «О себе» (до 250 символов).`,
      { reply_markup: settingsCancelKeyboard().reply_markup }
    );
  });

  bot.action("settings:cancel", async (ctx) => {
    clearPendingInputs(ctx);
    await ctx.answerCbQuery("Отменено");
    await renderSettings(ctx);
  });

  bot.action("menu:top_workers", async (ctx) => {
    await ctx.answerCbQuery();
    await renderTopWorkers(ctx, "all");
  });

  bot.action(/^top:period:(all|24h|7d|30d)$/, async (ctx) => {
    const period = ctx.match[1];
    await ctx.answerCbQuery(`Период: ${periodLabel(period)}`);
    await renderTopWorkers(ctx, period);
  });

  bot.action(/^top:user:(\d+):(all|24h|7d|30d)$/, async (ctx) => {
    const telegramId = ctx.match[1];
    const period = ctx.match[2];
    await ctx.answerCbQuery();
    await renderPublicProfile(ctx, telegramId, period, {
      back: ctx.session?.ui?.publicProfileBack || "menu:top_workers",
    });
  });

  bot.action("admin:panel", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    if (ctx.scene?.current) {
      try {
        await ctx.scene.leave();
      } catch (_) {
        /* ignore */
      }
    }
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await renderAdminPanel(ctx);
  });

  bot.action("admin:users", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await renderAdminUsers(ctx);
  });

  bot.action("admin:comms", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await renderAdminComms(ctx);
  });

  bot.action("admin:economy", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await renderAdminEconomy(ctx);
  });

  bot.action("admin:templates", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await renderAdminTemplates(ctx);
  });

  bot.action("admin:templates:enable", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "template_enable" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Включить шаблон</b>`,
        "",
        "Введите <b>ID шаблона</b> (только цифры).",
        "Пример: <code>785</code>",
        "",
        "После ID можно задать своё название.",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard("admin:templates").reply_markup }
    );
  });

  bot.action(/^admin:templates:rename:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const templateId = Number(ctx.match[1]);
    ctx.session.adminInput = { type: "template_rename", templateId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Название шаблона</b>`,
        "",
        `ID: <code>${templateId}</code>`,
        "Введите новое название (как будет видно воркерам).",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard("admin:templates").reply_markup }
    );
  });

  bot.action(/^admin:templates:disable:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const templateId = Number(ctx.match[1]);
    try {
      await disableTemplateById(null, templateId);
      await ctx.answerCbQuery(`#${templateId} выключен`);
      await renderAdminTemplates(ctx);
    } catch (error) {
      await ctx.answerCbQuery(error.message || "Ошибка", { show_alert: true });
    }
  });

  bot.action("admin:logs", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("package")} <b>Логи Steam</b>`,
        "",
        "Поиск по ID панели или просмотр списка через inline.",
      ].join("\n"),
      { reply_markup: adminLogsKeyboard().reply_markup }
    );
  });

  bot.action("admin:botlogs", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("file")} <b>Логи бота</b>`,
        "",
        `Выгрузка последних <b>${DEFAULT_EXPORT_LINES}</b> строк из буфера текущего процесса.`,
      ].join("\n"),
      { reply_markup: adminBotLogsKeyboard().reply_markup }
    );
  });

  bot.action("admin:botlogs:export", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery("Формирую файл…");
    try {
      const text = getRecentLogsText(DEFAULT_EXPORT_LINES);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `bot-logs-${stamp}.txt`;
      await ctx.replyWithDocument(
        { source: Buffer.from(text, "utf8"), filename },
        {
          caption: `${pe("file")} Последние ${DEFAULT_EXPORT_LINES} строк логов бота`,
          parse_mode: "HTML",
          reply_markup: adminBotLogsKeyboard().reply_markup,
        }
      );
    } catch (error) {
      logger.error("bot logs export failed", error.message);
      await ctx.reply(`${pe("error")} Не удалось выгрузить логи: ${error.message}`, {
        parse_mode: "HTML",
        reply_markup: adminBotLogsKeyboard().reply_markup,
      });
    }
  });

  bot.action("admin:logs:search", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "search_log" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("file")} <b>Поиск лога</b>`,
        "",
        "Введите <b>ID лога</b> из панели (только цифры).",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard("admin:logs").reply_markup }
    );
  });

  bot.action(/^admin:log:inline:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery("Карточка загружается…");
  });

  bot.action(/^admin:log:mafile:(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const logId = ctx.match[1];
    await ctx.answerCbQuery("Собираю MaFile…");
    try {
      const {
        fetchSteamAccountById,
        buildAdminMaFilePhoto,
        classifyAccountLog,
      } = require("../services/steamLogAdminService");
      const account = await fetchSteamAccountById(logId);
      if (classifyAccountLog(account) !== "mafile") {
        await ctx.reply(`${pe("info")} Этот лог не MaFile.`, { parse_mode: "HTML" });
        return;
      }
      const imageBuffer = await buildAdminMaFilePhoto(account);
      const login = account?.username || account?.steamInfo?.nickname || logId;
      await ctx.replyWithPhoto(
        { source: imageBuffer, filename: `steam-mafile-${logId}.png` },
        {
          caption: `${pe("gift")} <b>MaFile</b> лога <code>#${logId}</code>\n<code>${login}</code>`,
          parse_mode: "HTML",
        }
      );
    } catch (error) {
      await ctx.reply(`${pe("error")} ${error.message}`, { parse_mode: "HTML" });
    }
  });

  bot.action("admin:stats", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await renderAdminStats(ctx, "all");
  });

  bot.action(/^admin:stats:period:(all|24h|7d|30d)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const period = ctx.match[1];
    await ctx.answerCbQuery(`Период: ${periodLabel(period)}`);
    await renderAdminStats(ctx, period);
  });

  bot.action(/^admin:stats:top(?::(all|24h|7d|30d))?$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const period = ctx.match[1] || "all";
    await ctx.answerCbQuery();
    await renderTopWorkers(ctx, period, {
      back: `admin:stats:period:${period}`,
      periodPrefix: "admin:top:period",
    });
  });

  bot.action(/^admin:top:period:(all|24h|7d|30d)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const period = ctx.match[1];
    await ctx.answerCbQuery(`Период: ${periodLabel(period)}`);
    await renderTopWorkers(ctx, period, {
      back: `admin:stats:period:${period}`,
      periodPrefix: "admin:top:period",
    });
  });

  bot.action("admin:currency", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await renderAdminCurrency(ctx);
  });

  bot.action(/^admin:currency:set:(USD|RUB)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const next = await setDisplayCurrency(ctx.match[1]);
    await ctx.answerCbQuery(`Валюта: ${next === "RUB" ? "₽ RUB" : "$ USD"}`);
    await renderAdminEconomy(ctx);
  });

  bot.action("admin:currency:rate", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const current = await getUsdRubRate(90);
    ctx.session.adminInput = { type: "currency_rate" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("analytics")} Текущий курс: <b>1 USD = ${current} RUB</b>\nВведите новый курс (число больше 0).`,
      { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
    );
  });

  bot.action("admin:postbot", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await ctx.scene.enter("postbotScene");
  });

  bot.action("admin:broadcast", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await ctx.scene.enter("broadcastScene");
  });

  bot.action("admin:manuals_thread", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    try {
      const result = await seedManualsThread(ctx.telegram);
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Тред мануалов создан</b>`,
          "",
          `Чат: <code>${result.chatId}</code>`,
          `Thread ID: <code>${result.threadId}</code>`,
          `Ссылка на тред: ${result.threadLink}`,
          `Документация: ${result.docsUrl}`,
          result.pinned ? "Сообщение закреплено." : "Закрепить не удалось (проверь права).",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    } catch (e) {
      const desc = e?.response?.description || e.message || "ошибка";
      logger.warn("admin:manuals_thread failed", desc);
      await upsertBotMessage(
        ctx,
        [
          `${pe("error")} <b>Не удалось создать тред</b>`,
          "",
          String(desc),
          "",
          `Чат мануалов: <code>${manualsChatId()}</code>`,
          "Добавь бота в этот форум-чат админом с правом управлять топиками и писать сообщения.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    }
  });

  bot.action("admin:launch_announce", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    try {
      const result = await publishLaunchAnnounce(ctx.telegram);
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Анонс бота опубликован</b>`,
          "",
          `Канал: <code>${result.chatId}</code>`,
          `Message ID: <code>${result.messageId}</code>`,
          result.botUrl ? `Бот: ${result.botUrl}` : "",
          result.docsUrl ? `Мануалы: ${result.docsUrl}` : "",
          result.pinned ? "Сообщение закреплено." : "Закрепить не удалось (проверь права).",
        ]
          .filter(Boolean)
          .join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    } catch (e) {
      const desc = e?.response?.description || e.message || "ошибка";
      logger.warn("admin:launch_announce failed", desc);
      await upsertBotMessage(
        ctx,
        [
          `${pe("error")} <b>Не удалось опубликовать анонс</b>`,
          "",
          String(desc),
          "",
          `Канал: <code>${launchAnnounceChatId()}</code>`,
          "Добавь бота в канал админом с правом писать и закреплять сообщения.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    }
  });

  bot.action("admin:changelog", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    try {
      const result = await publishChangelog(ctx.telegram);
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Changelog опубликован</b>`,
          "",
          `Канал: <code>${result.chatId}</code>`,
          `Message ID: <code>${result.messageId}</code>`,
          result.pinned ? "Сообщение закреплено." : "Закрепить не удалось (проверь права).",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    } catch (e) {
      const desc = e?.response?.description || e.message || "ошибка";
      logger.warn("admin:changelog failed", desc);
      await upsertBotMessage(
        ctx,
        [
          `${pe("error")} <b>Не удалось опубликовать changelog</b>`,
          "",
          String(desc),
          "",
          `CHANGELOGS_CHAT_ID: <code>${changelogsChatId() || "не задан"}</code>`,
          "Нужен числовой id канала (не invite-ссылка). Бот — админ канала.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    }
  });

  bot.action("admin:dynamic_pin", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    try {
      const result = await publishOrRefreshDynamicPin(ctx.telegram);
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Динамический закреп обновлён</b>`,
          "",
          `Чат: <code>${result.chatId}</code>`,
          `Message ID: <code>${result.messageId}</code>`,
          result.refreshed ? "Обновлён существующий закреп." : "Создан и закреплён новый пост.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    } catch (e) {
      const desc = e?.response?.description || e.message || "ошибка";
      logger.warn("admin:dynamic_pin failed", desc);
      await upsertBotMessage(
        ctx,
        [
          `${pe("error")} <b>Не удалось обновить закреп</b>`,
          "",
          String(desc),
          "",
          `Чат: <code>${dynamicPinChatId() || "не задан"}</code>`,
          "Бот должен быть админом чата с правом закреплять и редактировать сообщения.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:comms").reply_markup }
      );
    }
  });

  bot.action("admin:search", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await renderAdminUsers(ctx);
  });

  bot.action("admin:uproject_workers", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const adminUser = await ensureUser(ctx.from);
    if (!adminUser.panelUsername || !adminUser.panelPassword) {
      await upsertBotMessage(
        ctx,
        [
          `${pe("error")} <b>Нет служебного доступа</b>`,
          "",
          "Откройте «Сайты» один раз — доступ создастся автоматически.",
        ].join("\n"),
        { reply_markup: adminResultKeyboard("admin:users").reply_markup }
      );
      return;
    }
    try {
      const auth = await authCredentials(adminUser.panelUsername, adminUser.panelPassword);
      if (!auth.token) throw new Error("Не удалось получить список.");
      const payload = await getTeamWorkers(auth.token, 0, 50);
      const rows = payload?.rows || payload?.data?.rows || [];
      const lines = [
        `${pe("users")} <b>Воркеры сайтов</b>`,
        "",
        `Всего в ответе: <b>${rows.length}</b>`,
        "",
      ];
      if (!rows.length) {
        lines.push("<i>Список пуст или нет прав на просмотр.</i>");
      } else {
        rows.slice(0, 30).forEach((row, i) => {
          const login = row.username || row.login || "—";
          const id = row.id != null ? row.id : "—";
          lines.push(`${i + 1}. <code>${login}</code> · id <code>${id}</code>`);
        });
        if (rows.length > 30) lines.push("", `<i>…и ещё ${rows.length - 30}</i>`);
      }
      await upsertBotMessage(ctx, lines.join("\n"), {
        reply_markup: adminResultKeyboard("admin:users").reply_markup,
      });
    } catch (e) {
      const desc = e?.response?.data?.message || e?.response?.description || e.message;
      await upsertBotMessage(ctx, `${pe("error")} ${desc}`, {
        reply_markup: adminResultKeyboard("admin:users").reply_markup,
      });
    }
  });

  bot.action("admin:curators_list", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const curators = await listCurators();
    const lines = [
      `${pe("userVerified")} <b>Кураторы</b>`,
      "",
      `Всего: <b>${curators.length}</b>`,
      "",
    ];
    if (!curators.length) {
      lines.push("<i>Пока никого нет.</i>");
    } else {
      curators.forEach((u, i) => {
        const nick = u.username ? `@${u.username}` : "без username";
        lines.push(`${i + 1}. ${nick} · <code>${u.telegramId}</code>`);
      });
    }
    lines.push(
      "",
      `${pe("info")} Назначить: <b>Поиск участника</b> → карточка → «Назначить куратором».`
    );
    await upsertBotMessage(ctx, lines.join("\n"), {
      reply_markup: adminResultKeyboard("admin:users").reply_markup,
    });
  });

  bot.action("admin:callers_list", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    const callers = await listCallers();
    const lines = [
      `${pe("broadcast")} <b>Прозвонщицы</b>`,
      "",
      `Всего: <b>${callers.length}</b>`,
      "",
    ];
    if (!callers.length) {
      lines.push("<i>Пока никого нет.</i>");
    } else {
      callers.forEach((u, i) => {
        const nick = u.username ? `@${u.username}` : "без username";
        lines.push(`${i + 1}. ${nick} · <code>${u.telegramId}</code>`);
      });
    }
    lines.push(
      "",
      `${pe("info")} Назначить: <b>Поиск участника</b> → карточка → «Назначить прозвонщицей».`
    );
    await upsertBotMessage(ctx, lines.join("\n"), {
      reply_markup: adminResultKeyboard("admin:users").reply_markup,
    });
  });

  bot.action("admin:global_percent", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const current = await getGlobalWorkerPercent(80);
    ctx.session.adminInput = { type: "global_percent" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("analytics")} Текущий глобальный процент: <b>${current}%</b>\nВведите новое значение от 1 до 100.`,
      { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
    );
  });

  bot.action("admin:fake_profit:start", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("coins")} <b>Фейк-профит</b>\n\nКого указать в подписи?`, {
      reply_markup: Markup.inlineKeyboard([
        [btn("Аноним", "admin:fake_profit:anon", "hidden"), btn("Участник", "admin:fake_profit:user", "profile")],
        [btn("Назад", "admin:economy", "home")],
      ]).reply_markup,
    });
  });

  bot.action("admin:fake_profit:anon", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "fake_profit_skins", attribution: "anon" };
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML, {
      reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
    });
  });

  bot.action("admin:fake_profit:user", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "fake_profit_owner" };
    await ctx.answerCbQuery();
    await upsertBotMessage(ctx, `${pe("profile")} Укажите Telegram <b>ID</b> или <code>@username</code> участника.`, {
      reply_markup: adminCancelKeyboard("admin:economy").reply_markup,
    });
  });

  bot.action("admin:fake_log:start", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "fake_log_owner" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("package")} <b>Фейк-лог</b>\n\nУкажите Telegram <b>ID</b> или <code>@username</code> участника — ему уйдёт карточка в ЛС.`,
      { reply_markup: adminCancelKeyboard("admin:economy").reply_markup }
    );
  });

  bot.action(/^admin:member:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();
    const currencyCtx = await getCurrencyContext();
    await upsertBotMessage(ctx, formatMemberCardHtml(member, currencyCtx), {
      reply_markup: memberActionKeyboard(telegramId, member.isBanned, member.isCurator, member.isCaller, member.isModerator).reply_markup,
    });
  });

  bot.action(/^admin:panelacc:recreate:ok:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    await ctx.answerCbQuery();
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден.`, {
        reply_markup: adminResultKeyboard().reply_markup,
      });
      return;
    }
    try {
      const updated = await recreateWorkerPanelAccount(member);
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(
        ctx,
        `${pe("success")} Создан новый служебный аккаунт сайтов.\n\n${formatMemberCardHtml(updated, currencyCtx)}`,
        {
          reply_markup: memberActionKeyboard(
            telegramId, updated.isBanned, updated.isCurator, updated.isCaller, updated.isModerator).reply_markup,
        }
      );
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
        reply_markup: memberPanelAccountKeyboard(telegramId, Boolean(member.panelUsername)).reply_markup,
      });
    }
  });

  bot.action(/^admin:panelacc:recreate:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("error")} <b>Пересоздание аккаунта сайтов</b>`,
        "",
        `Текущий: <code>${member.panelUsername || "—"}</code>`,
        "",
        "Будет создан новый логин и пароль в панели.",
        "Старый аккаунт останется в uproject, но бот перестанет его использовать.",
      ].join("\n"),
      { reply_markup: memberPanelRecreateConfirmKeyboard(telegramId).reply_markup }
    );
  });

  bot.action(/^admin:panelacc:create:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    await ctx.answerCbQuery();
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await upsertBotMessage(ctx, `${pe("error")} Пользователь не найден.`, {
        reply_markup: adminResultKeyboard().reply_markup,
      });
      return;
    }
    try {
      if (member.panelUsername && member.panelPassword) {
        await upsertBotMessage(
          ctx,
          `${pe("info")} Аккаунт уже есть: <code>${member.panelUsername}</code>\nМожно пересоздать или привязать другой.`,
          { reply_markup: memberPanelAccountKeyboard(telegramId, true).reply_markup }
        );
        return;
      }
      const updated = await ensureWorkerPanelAccount(member);
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(
        ctx,
        `${pe("success")} Служебный аккаунт сайтов создан.\n\n${formatMemberCardHtml(updated, currencyCtx)}`,
        {
          reply_markup: memberActionKeyboard(
            telegramId, updated.isBanned, updated.isCurator, updated.isCaller, updated.isModerator).reply_markup,
        }
      );
    } catch (error) {
      await upsertBotMessage(ctx, `${pe("error")} ${formatPanelError(error)}`, {
        reply_markup: memberPanelAccountKeyboard(telegramId, false).reply_markup,
      });
    }
  });

  bot.action(/^admin:panelacc:bind:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "panel_bind", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Привязка аккаунта сайтов</b>`,
        "",
        `Участник: <code>${telegramId}</code>`,
        "",
        "Отправьте логин и пароль панели:",
        "<code>логин:пароль</code>",
        "",
        `${pe("info")} Или через пробел: <code>логин пароль</code>`,
      ].join("\n"),
      { reply_markup: adminCancelKeyboard(`admin:panelacc:${telegramId}`).reply_markup }
    );
  });

  bot.action(/^admin:panelacc:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    if (["create", "bind", "recreate"].includes(telegramId.split(":")[0])) return;
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    clearPendingInputs(ctx);
    await ctx.answerCbQuery();
    const hasAccount = Boolean(member.panelUsername && member.panelPassword);
    await upsertBotMessage(
      ctx,
      [
        `${pe("lock")} <b>Аккаунт сайтов</b>`,
        "",
        `Участник: <code>${telegramId}</code> @${member.username || "unknown"}`,
        `Статус: ${hasAccount ? `<code>${member.panelUsername}:${member.panelPassword}</code>` : "не создан"}`,
        "",
        "Создать новый — новый аккаунт в панели.",
        "Привязать другой — указать существующий логин и пароль.",
      ].join("\n"),
      { reply_markup: memberPanelAccountKeyboard(telegramId, hasAccount).reply_markup }
    );
  });

  bot.action(/^admin:curator:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    const next = !member.isCurator;
    const updated = await setCurator(telegramId, next);
    if (next) {
      ctx.session.adminInput = { type: "curator_desc", telegramId };
      await ctx.answerCbQuery("Куратор назначен");
      await upsertBotMessage(
        ctx,
        [
          `${pe("userVerified")} Куратор назначен: <code>${telegramId}</code>`,
          "",
          `${pe("edit")} Введите <b>описание куратора</b> (текст для карточки).`,
        ].join("\n"),
        { reply_markup: adminCancelKeyboard(`admin:member:${telegramId}`).reply_markup }
      );
      return;
    }
    await ctx.answerCbQuery("Куратор снят");
    const currencyCtx = await getCurrencyContext();
    await upsertBotMessage(ctx, formatMemberCardHtml(updated, currencyCtx), {
      reply_markup: memberActionKeyboard(
        telegramId, updated.isBanned, updated.isCurator, updated.isCaller, updated.isModerator).reply_markup,
    });
  });

  bot.action(/^admin:curator_cfg:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member?.isCurator) {
      await ctx.answerCbQuery("Пользователь не куратор", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "curator_desc", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Настройки куратора</b>`,
        "",
        `Сейчас:`,
        buildCuratorCardHtml(member),
        "",
        "Введите новое <b>описание</b> куратора.",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard(`admin:member:${telegramId}`).reply_markup }
    );
  });

  bot.action(/^admin:caller:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    const next = !member.isCaller;
    const updated = await setCaller(telegramId, next);
    if (next) {
      ctx.session.adminInput = { type: "caller_desc", telegramId };
      await ctx.answerCbQuery("Прозвонщица назначена");
      await upsertBotMessage(
        ctx,
        [
          `${pe("broadcast")} Прозвонщица назначена: <code>${telegramId}</code>`,
          "",
          `${pe("edit")} Введите <b>описание прозвонщицы</b> (текст для карточки).`,
        ].join("\n"),
        { reply_markup: adminCancelKeyboard(`admin:member:${telegramId}`).reply_markup }
      );
      return;
    }
    await ctx.answerCbQuery("Прозвонщица снята");
    const currencyCtx = await getCurrencyContext();
    await upsertBotMessage(ctx, formatMemberCardHtml(updated, currencyCtx), {
      reply_markup: memberActionKeyboard(
        telegramId, updated.isBanned, updated.isCurator, updated.isCaller, updated.isModerator).reply_markup,
    });
  });

  bot.action(/^admin:moderator:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    const next = !member.isModerator;
    const updated = await setModerator(telegramId, next);
    await ctx.answerCbQuery(next ? "Модератор добавлен" : "Модератор снят");
    const currencyCtx = await getCurrencyContext();
    await upsertBotMessage(
      ctx,
      [
        formatMemberCardHtml(updated, currencyCtx),
        "",
        next
          ? `${pe("success")} Пользователь теперь модератор (ban/mute/warn/kick в чатах).`
          : `${pe("info")} Права модератора сняты.`,
      ].join("\n"),
      {
        reply_markup: memberActionKeyboard(
          telegramId,
          updated.isBanned,
          updated.isCurator,
          updated.isCaller,
          updated.isModerator
        ).reply_markup,
      }
    );
  });

  bot.action(/^admin:caller_cfg:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member?.isCaller) {
      await ctx.answerCbQuery("Пользователь не прозвонщица", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "caller_desc", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("edit")} <b>Настройки прозвонщицы</b>`,
        "",
        `Сейчас:`,
        buildCallerCardHtml(member),
        "",
        "Введите новое <b>описание</b> прозвонщицы.",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard(`admin:member:${telegramId}`).reply_markup }
    );
  });

  bot.action(/^curator:apply:(.+)$/, async (ctx) => {
    const curatorTelegramId = ctx.match[1];
    const applicant = await ensureUser(ctx.from);
    if (applicant.isBanned) {
      await ctx.answerCbQuery("Доступ ограничен", { show_alert: true });
      return;
    }
    const curator = await getUserByTelegramId(curatorTelegramId);
    if (!curator?.isCurator) {
      await ctx.answerCbQuery("Куратор не найден", { show_alert: true });
      return;
    }
    try {
      const app = await createCuratorApplication(applicant, curator);
      try {
        await ctx.telegram.sendMessage(
          curator.telegramId,
          buildCuratorApplicationNotifyHtml(applicant),
          {
            parse_mode: "HTML",
            reply_markup: curatorApplicationModerationKeyboard(app._id.toString()).reply_markup,
          }
        );
      } catch (error) {
        logger.warn("curator notify failed", curator.telegramId, error.message);
      }
      await ctx.answerCbQuery("Заявка отправлена");
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (_) {
        /* ignore */
      }
      await ctx.reply(
        [
          `${pe("success")} <b>Заявка куратору отправлена</b>`,
          "",
          `${pe("time")} Ожидайте решения.`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (error) {
      await ctx.answerCbQuery(error.message || "Ошибка", { show_alert: true });
    }
  });

  bot.action(/^curator:accept:([a-f0-9]{24})$/i, async (ctx) => {
    try {
      const { applicant } = await acceptCuratorApplication(ctx.match[1], ctx.from.id);
      await ctx.answerCbQuery("Заявка принята");
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (_) {
        /* ignore */
      }
      try {
        await ctx.reply(`${pe("success")} Заявка принята.`, { parse_mode: "HTML" });
      } catch (_) {
        /* ignore */
      }
      try {
        await ctx.telegram.sendMessage(
          applicant.telegramId,
          `${pe("success")} <b>Куратор принял вашу заявку.</b>\nВы привязаны к куратору.`,
          { parse_mode: "HTML" }
        );
      } catch (_) {
        /* ignore */
      }
    } catch (error) {
      await ctx.answerCbQuery(error.message || "Ошибка", { show_alert: true });
    }
  });

  bot.action(/^curator:reject:([a-f0-9]{24})$/i, async (ctx) => {
    try {
      const app = await rejectCuratorApplication(ctx.match[1], ctx.from.id);
      await ctx.answerCbQuery("Заявка отклонена");
      try {
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      } catch (_) {
        /* ignore */
      }
      try {
        await ctx.reply(`${pe("error")} Заявка отклонена.`, { parse_mode: "HTML" });
      } catch (_) {
        /* ignore */
      }
      try {
        await ctx.telegram.sendMessage(
          app.applicantTelegramId,
          `${pe("error")} Куратор отклонил вашу заявку.`,
          { parse_mode: "HTML" }
        );
      } catch (_) {
        /* ignore */
      }
    } catch (error) {
      await ctx.answerCbQuery(error.message || "Ошибка", { show_alert: true });
    }
  });

  bot.action(/^admin:kick:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    await setTeamMember(telegramId, false);
    await ctx.answerCbQuery("Участник удалён из команды");
    await upsertBotMessage(
      ctx,
      `${pe("error")} Участник <code>${telegramId}</code> кикнут.`,
      { reply_markup: adminResultKeyboard().reply_markup }
    );
  });

  bot.action(/^admin:ban:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    await setBan(telegramId, true);
    await ctx.answerCbQuery("Пользователь забанен");
    await upsertBotMessage(
      ctx,
      `${pe("userBlocked")} Пользователь <code>${telegramId}</code> забанен.`,
      { reply_markup: adminResultKeyboard().reply_markup }
    );
  });

  bot.action(/^admin:unban:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    await setBan(telegramId, false);
    await ctx.answerCbQuery("Пользователь разблокирован");
    await upsertBotMessage(
      ctx,
      `${pe("success")} Пользователь <code>${telegramId}</code> разблокирован.`,
      { reply_markup: adminResultKeyboard().reply_markup }
    );
  });

  bot.action(/^admin:msg:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    ctx.session.adminCompose = { telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("broadcast")} Введи текст сообщения для пользователя <code>${telegramId}</code>.`,
      { reply_markup: adminCancelKeyboard("admin:users").reply_markup }
    );
  });

  bot.action(/^admin:profit:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "profit", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("coins")} Введите сумму общего профита для <code>${telegramId}</code>.\nПроцент воркера: ${member.profitPercent}%`,
      { reply_markup: adminCancelKeyboard("admin:users").reply_markup }
    );
  });

  bot.action(/^admin:wallet:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "wallet_topup", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("wallet")} <b>Пополнение кошелька</b>`,
        "",
        `Участник: <code>${telegramId}</code> @${member.username || "—"}`,
        `Текущий баланс: <b>$${Number(member.totalProfit || 0).toFixed(2)}</b>`,
        "",
        "Введите сумму в <b>долларах США ($)</b>. Сумма зачислится на кошелёк целиком (без процента).",
      ].join("\n"),
      { reply_markup: adminCancelKeyboard(`admin:member:${telegramId}`).reply_markup }
    );
  });

  bot.action(/^admin:percent:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = ctx.match[1];
    const member = await getUserByTelegramId(telegramId);
    if (!member) {
      await ctx.answerCbQuery("Пользователь не найден", { show_alert: true });
      return;
    }
    ctx.session.adminInput = { type: "percent", telegramId };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("settings")} Введите новый процент воркера для <code>${telegramId}</code>.\nТекущее значение: ${member.profitPercent}%`,
      { reply_markup: adminCancelKeyboard("admin:users").reply_markup }
    );
  });

  bot.action("admin:apps", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await renderAdminAppsHub(ctx);
  });

  bot.action("admin:apps:noop", async (ctx) => {
    await ctx.answerCbQuery();
  });

  bot.action(/^admin:apps:(pending|closed):(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const kind = ctx.match[1];
    const page = Number(ctx.match[2]) || 0;
    await ctx.answerCbQuery();
    await renderAdminAppsList(ctx, kind, page);
  });

  bot.action(/^admin:apps:view:(pending|closed):(\d+):([a-f0-9]{24})$/i, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const kind = ctx.match[1];
    const page = Number(ctx.match[2]) || 0;
    const id = ctx.match[3];
    await ctx.answerCbQuery();
    await renderAdminAppView(ctx, id, kind, page);
  });

  bot.action(/^admin:apps:reject:ask:([a-f0-9]{24})$/i, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = ctx.match[1];
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("error")} <b>Изменить решение?</b>`,
        "",
        "Заявка будет отклонена, пользователь будет исключён из команды.",
      ].join("\n"),
      { reply_markup: adminAppRejectConfirmKeyboard(id, `admin:apps:view:closed:0:${id}`).reply_markup }
    );
  });

  bot.action(/^admin:apps:reject:confirm:([a-f0-9]{24})$/i, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const id = ctx.match[1];
    const result = await decideApplication(ctx.telegram, id, "reject", ctx.from);
    if (!result.ok) {
      const msg =
        result.reason === "same_status"
          ? "Уже отклонена"
          : result.reason === "not_found"
            ? "Заявка не найдена"
            : "Не удалось изменить решение";
      await ctx.answerCbQuery(msg, { show_alert: true });
      await renderAdminAppView(ctx, id, "closed", 0);
      return;
    }
    await ctx.answerCbQuery(
      result.reversed ? "Решение изменено: отклонена" : "Заявка отклонена"
    );
    await renderAdminAppView(ctx, id, "closed", 0);
  });

  bot.action(/^admin:apps:(accept|reject):([a-f0-9]{24})$/i, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const action = ctx.match[1];
    const id = ctx.match[2];
    const result = await decideApplication(ctx.telegram, id, action, ctx.from);
    if (!result.ok) {
      const msg =
        result.reason === "same_status"
          ? action === "accept"
            ? "Уже принята"
            : "Уже отклонена"
          : result.reason === "not_found"
            ? "Заявка не найдена"
            : "Не удалось обработать заявку";
      await ctx.answerCbQuery(msg, { show_alert: true });
      await renderAdminAppView(ctx, id, "closed", 0);
      return;
    }
    const toast =
      action === "accept"
        ? result.reversed
          ? "Решение изменено: принята"
          : "Заявка принята"
        : result.reversed
          ? "Решение изменено: отклонена"
          : "Заявка отклонена";
    await ctx.answerCbQuery(toast);
    await renderAdminAppView(ctx, id, "closed", 0);
  });

  bot.action("admin:apps:questions", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    await ctx.answerCbQuery();
    await renderAdminQuestions(ctx);
  });

  bot.action("admin:apps:qadd", async (ctx) => {
    if (!requireAdmin(ctx)) return;
    ctx.session.adminInput = { type: "app_question_label" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("edit")} Введите <b>название</b> вопроса (короткая подпись, напр. «Опыт»).`,
      { reply_markup: adminCancelKeyboard("admin:apps:questions").reply_markup }
    );
  });

  bot.action(/^admin:apps:qdel:confirm:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const key = ctx.match[1];
    try {
      await removeFormQuestion("teamApplication", key);
      await ctx.answerCbQuery("Вопрос удалён");
      await renderAdminQuestions(ctx);
    } catch (error) {
      await ctx.answerCbQuery(String(error.message || error).slice(0, 180), {
        show_alert: true,
      });
    }
  });

  bot.action(/^admin:apps:qdel:(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const key = ctx.match[1];
    if (String(key).startsWith("confirm:")) return;
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      `${pe("delete")} Удалить этот вопрос из формы заявки?`,
      { reply_markup: adminQuestionDeleteConfirmKeyboard(key).reply_markup }
    );
  });

  bot.action(/^moderate:(accept|reject):(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const action = ctx.match[1];
    const applicationId = ctx.match[2];
    const result = await decideApplication(ctx.telegram, applicationId, action, ctx.from);
    if (!result.ok) {
      const msg =
        result.reason === "same_status"
          ? action === "accept"
            ? "Уже принята"
            : "Уже отклонена"
          : result.reason === "not_found"
            ? "Заявка не найдена"
            : "Не удалось обработать";
      await ctx.answerCbQuery(msg, { show_alert: true });
      return;
    }

    const moderatorName = ctx.from.first_name || ctx.from.username || "Admin";
    try {
      await ctx.editMessageReplyMarkup(
        buildDecisionChannelMarkup(applicationId, action, moderatorName)
      );
    } catch (_) {
      /* ignore */
    }
    await ctx.answerCbQuery(
      action === "accept"
        ? result.reversed
          ? "Решение изменено: принята"
          : "Заявка принята"
        : result.reversed
          ? "Решение изменено: отклонена"
          : "Заявка отклонена"
    );
  });

  bot.action("log:sell:pending", async (ctx) => {
    await ctx.answerCbQuery("Заявка уже отправлена", { show_alert: true });
  });

  bot.action(/^log:sell:(.+)$/, async (ctx) => {
    const sourceId = String(ctx.match[1] || "");
    if (!sourceId || sourceId === "pending") {
      await ctx.answerCbQuery("Некорректная заявка", { show_alert: true });
      return;
    }

    const log = await SteamLog.findOne({ sourceId });
    if (!log) {
      await ctx.answerCbQuery("Лог не найден", { show_alert: true });
      return;
    }
    if (String(log.ownerTelegramId) !== String(ctx.from.id)) {
      await ctx.answerCbQuery("Это не ваш лог", { show_alert: true });
      return;
    }
    if (log.saleStatus === "pending" || log.saleStatus === "done") {
      await ctx.answerCbQuery("Заявка уже отправлена", { show_alert: true });
      try {
        await ctx.editMessageReplyMarkup(steamLogSellPendingKeyboard().reply_markup);
      } catch (_) {
        /* ignore */
      }
      return;
    }

    try {
      await submitLogSaleRequest({ telegram: ctx.telegram }, log);
      try {
        await ctx.editMessageReplyMarkup(steamLogSellPendingKeyboard().reply_markup);
      } catch (_) {
        /* ignore */
      }
      await ctx.answerCbQuery("Заявка на продажу отправлена");
      await ctx.reply(
        [
          `${pe("success")} <b>Заявка на продажу отправлена</b>`,
          "",
          `${pe("coins")} Сумма: <b>${Number(log.totalProfit || 0).toFixed(2).replace(".", ",")}$</b>`,
          `${pe("time")} Ожидайте ответа команды.`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (error) {
      logger.warn("log:sell failed", sourceId, error.message);
      await ctx.answerCbQuery(error.message || "Ошибка", { show_alert: true });
    }
  });

  bot.action("moderate:done", async (ctx) => {
    await ctx.answerCbQuery("Заявка уже обработана");
  });
}

module.exports = { registerCallbackHandlers };
