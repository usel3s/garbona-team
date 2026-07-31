const {
  rulesAcceptKeyboard,
  profileKeyboard,
  aboutProjectKeyboard,
  aboutRulesBackKeyboard,
  settingsKeyboard,
  settingsCancelKeyboard,
  topWorkersKeyboard,
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
  memberActionKeyboard,
  memberPanelAccountKeyboard,
  memberPanelRecreateConfirmKeyboard,
  adminCancelKeyboard,
  adminResultKeyboard,
} = require("../keyboards/admin");
const { renderHome } = require("../commands/start");
const {
  ensureUser,
  isAdminTelegramId,
  setBan,
  setTeamMember,
  getUserByTelegramId,
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
  buildRejectedChannelSuffix,
  attachChannelMeta,
  resetPendingApproval,
  methodLabel,
} = require("../services/withdrawalService");
const {
  getApplicationById,
  listApplications,
  decideApplication,
  formatApplicationCard,
  getApplicationSubmitGate,
} = require("../services/applicationService");
const { getForm, removeFormQuestion } = require("../services/formService");
const {
  adminAppsHubKeyboard,
  adminAppsListKeyboard,
  adminAppViewKeyboard,
  adminQuestionsKeyboard,
  adminQuestionDeleteConfirmKeyboard,
} = require("../keyboards/application");
const { env } = require("../config/env");
const { getProjectRulesLines } = require("../config/projectRules");
const { logger } = require("../utils/logger");
const { upsertBotMessage } = require("../utils/message");
const { pe, btn } = require("../utils/emoji");
const { formatMemberCardHtml } = require("../utils/adminMemberCard");
const { clearPendingInputs } = require("../utils/session");
const ProfitTransaction = require("../models/ProfitTransaction");
const User = require("../models/User");
const {
  getGlobalWorkerPercent,
  getDisplayCurrency,
  setDisplayCurrency,
  getUsdRubRate,
} = require("../services/settingsService");
const {
  getCurrencyContext,
  formatDisplayAmount,
} = require("../services/currencyService");
const { seedManualsThread, manualsChatId } = require("../services/manualsThreadService");
const { authCredentials, getTeamWorkers, formatPanelError } = require("../services/apiService");
const {
  ensureWorkerPanelAccount,
  recreateWorkerPanelAccount,
} = require("../services/panelAccountService");
const { getAdminDashboardStats } = require("../services/adminStatsService");
const { FAKE_STEAM_PROFIT_SKINS_INSTRUCTION_HTML } = require("../utils/fakeSteamProfitInput");
const { submitLogSaleRequest } = require("../services/steamMonitorService");
const SteamLog = require("../models/SteamLog");
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
  const roleLabel =
    user.role === "admin" ? "Администратор" : user.isTeamMember ? "Воркер" : "Пользователь";
  const daysWithTeam = Math.max(
    1,
    Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  const stats = await getUserProfitStatsByTelegramId(user.telegramId, period);
  const periodProfit = stats ? stats.periodProfit : 0;
  const operationsCount = stats ? stats.operationsCount : 0;

  const lines = [
    `${pe("profile")} <b>Твой профиль</b> [<code>${user.telegramId}</code>]`,
    ` ┖ Статус: ${roleLabel}`,
    "",
    `${pe("statistics")} <b>Статистика ${periodLabel(period)}:</b>`,
  ];

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

  await upsertBotMessage(ctx, lines.join("\n"), {
    reply_markup: profileKeyboard(period).reply_markup,
  });
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

function periodSince(period) {
  const now = Date.now();
  if (period === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  if (period === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (period === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return null;
}

function topPeriodTopic(period) {
  const map = {
    all: "всё время",
    "24h": "24 часа",
    "7d": "7 дней",
    "30d": "30 дней",
  };
  return map[period] || map.all;
}

async function renderTopWorkers(ctx, period = "all", options = {}) {
  const since = period === "all" ? null : periodSince(period);
  const match = since ? { createdAt: { $gte: since } } : {};
  const currencyCtx = await getCurrencyContext();
  const back = options.back || "menu:home";
  const periodPrefix = options.periodPrefix || "top:period";

  const agg = await ProfitTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$userId",
        total: { $sum: "$workerShare" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);

  const userIds = agg.map((a) => a._id);
  const members = await User.find({ _id: { $in: userIds } }).select("username telegramId");
  const byId = new Map(members.map((m) => [String(m._id), m]));

  const rows = agg.map((a) => {
    const user = byId.get(String(a._id));
    return {
      username: user?.username || user?.telegramId || String(a._id),
      total: Number(a.total || 0),
      count: Number(a.count || 0),
    };
  });

  const totalAmount = rows.reduce((sum, r) => sum + r.total, 0);
  const totalCount = rows.reduce((sum, r) => sum + (r.count || 0), 0);
  const medals = [pe("gift"), pe("coins"), pe("tag")];
  const topic = topPeriodTopic(period);

  const lines = [
    `${pe("analytics")} <b>Топ воркеров команды</b>`,
    "",
    `За <b>${topic}</b> <i>(начислено по профитам)</i>:`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("Пока нет данных по выбранному периоду.");
  } else {
    rows.forEach((r, i) => {
      const icon = medals[i] || pe("users");
      const countPart = r.count > 0 ? ` — ${r.count} шт.` : "";
      lines.push(
        `${icon} ${r.username} — ${formatDisplayAmount(r.total, currencyCtx)}${countPart}`
      );
    });
    lines.push("");
    lines.push(
      `Итого за <b>${topic}</b>: ${formatDisplayAmount(totalAmount, currencyCtx)}${totalCount ? ` — ${totalCount} шт.` : ""}`
    );
  }

  await upsertBotMessage(ctx, lines.join("\n"), {
    reply_markup: topWorkersKeyboard(period, { back, periodPrefix }).reply_markup,
  });
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
    ctx.session.walletWithdraw = { step: "amount" };
    await ctx.answerCbQuery();
    await upsertBotMessage(
      ctx,
      [
        `${pe("transfer")} Введите <b>сумму вывода в долларах США ($)</b>.`,
        "",
        `Доступно: <b>${formatDisplayAmount(available, currencyCtx)}</b>`,
        `Минимум: <b>${formatDisplayAmount(minW, currencyCtx)}</b>`,
        "",
        "<i>Ввод суммы всегда в USD (внутренняя валюта баланса).</i>",
      ].join("\n"),
      {
        reply_markup: walletAmountCancelKeyboard().reply_markup,
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

  bot.action(/^wallet:method:(xRocketr|cryptobot|usdt_ton)$/, async (ctx) => {
    const method = ctx.match[1];
    const user = await ensureUser(ctx.from);
    const st = ctx.session?.walletWithdraw;
    if (!st || st.step !== "method" || !Number.isFinite(Number(st.amount))) {
      await ctx.answerCbQuery("Начните вывод заново", { show_alert: true });
      return;
    }
    const amount = Number(st.amount);
    ctx.session.walletWithdraw = null;
    try {
      const doc = await createWithdrawalRequest(user, amount, method);
      const text = buildChannelMessageHtml(doc);
      const msg = await ctx.telegram.sendMessage(env.payoutRequestsChannelId, text, {
        parse_mode: "HTML",
        reply_markup: payoutModerationKeyboard(doc._id.toString()).reply_markup,
      });
      await attachChannelMeta(doc._id, msg.chat.id, msg.message_id);
      await ctx.answerCbQuery("Заявка отправлена");
      const currencyCtx = await getCurrencyContext();
      await upsertBotMessage(
        ctx,
        [
          `${pe("success")} <b>Заявка на выплату создана</b>`,
          "",
          `Сумма: ${formatDisplayAmount(amount, currencyCtx)}`,
          `Способ: ${methodLabel(method)}`,
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
      await ctx.telegram.sendMessage(
        ctx.from.id,
        [
          `${pe("success")} <b>Одобрение выплаты</b>`,
          "",
          `Заявка: <code>${id}</code>`,
          `Пользователь: @${updated.username || "—"} (<code>${updated.telegramId}</code>)`,
          `Сумма: <b>$${Number(updated.amountUsd).toFixed(2)}</b>`,
          `Способ: ${methodLabel(updated.method)}`,
          "",
          "Пришлите <b>следующим сообщением</b> ссылку для пользователя (https://…).",
        ].join("\n"),
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
      reply_markup: memberActionKeyboard(telegramId, member.isBanned).reply_markup,
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
        { reply_markup: memberActionKeyboard(telegramId, updated.isBanned).reply_markup }
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
        { reply_markup: memberActionKeyboard(telegramId, updated.isBanned).reply_markup }
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

  bot.action(/^admin:apps:(accept|reject):([a-f0-9]{24})$/i, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const action = ctx.match[1];
    const id = ctx.match[2];
    const result = await decideApplication(ctx.telegram, id, action, ctx.from);
    if (!result.ok) {
      await ctx.answerCbQuery("Заявка уже обработана", { show_alert: true });
      await renderAdminAppView(ctx, id, "closed", 0);
      return;
    }
    await ctx.answerCbQuery(action === "accept" ? "Заявка принята" : "Заявка отклонена");
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
      await ctx.answerCbQuery("Заявка уже обработана", { show_alert: true });
      return;
    }

    const moderatorName = ctx.from.first_name || ctx.from.username || "Admin";
    const resultLabel =
      action === "accept"
        ? `Принял: ${moderatorName}`
        : `Отклонил: ${moderatorName}`;

    try {
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            btn(
              resultLabel,
              "moderate:done",
              action === "accept" ? "success" : "error"
            ),
          ],
        ],
      });
    } catch (_) {
      /* ignore */
    }
    await ctx.answerCbQuery(
      action === "accept" ? "Заявка принята" : "Заявка отклонена"
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
