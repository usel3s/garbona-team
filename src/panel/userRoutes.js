const express = require("express");
const { env } = require("../config/env");
const {
  verifyWorkerTelegramLogin,
  setWorkerSessionCookie,
  clearWorkerSessionCookie,
  requireWorker,
  canAccessWorkerPanel,
} = require("./userAuth");
const { ensureUser, getUserByTelegramId } = require("../services/userService");
const { serializeMember } = require("./serializers");
const { getCurrencyContext } = require("../services/currencyService");
const {
  listDomains,
  getDomainDetail,
  previewAddDomain,
  addDomain,
  removeDomain,
  listTemplates,
  createLink,
  listWorkers,
} = require("../services/adminSitesService");
const { listWorkerLogs, listWorkerTasks } = require("../services/workerPanelService");
const {
  createWithdrawalRequest,
  methodLabel,
  getNetworkFeeUsd,
  METHOD_LABELS,
} = require("../services/withdrawalService");
const { isAdminTelegramId } = require("../services/userService");

function createUserRouter(_bot) {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    const botId = String(env.botToken || "").split(":")[0] || "";
    res.json({
      botUsername: env.botUsername || "",
      botId,
      authDisabled: Boolean(env.panelAuthDisabled),
      supportUrl: env.supportUrl || "",
      minWithdrawalUsd: env.walletMinWithdrawalUsd,
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

      if (!canAccessWorkerPanel(user)) {
        return res.status(403).json({ error: "not_team_member" });
      }

      setWorkerSessionCookie(res, tg.telegramId);
      const currencyCtx = await getCurrencyContext();
      return res.json({
        ok: true,
        user: {
          ...serializeMember(user, currencyCtx),
          photoUrl: tg.photoUrl || "",
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
    res.json({
      user: {
        ...serializeMember(req.worker, currencyCtx),
        payoutMethod: req.worker.payoutMethod || "",
        payoutAddress: req.worker.payoutAddress || "",
        isAdmin: isAdminTelegramId(req.worker.telegramId),
        photoUrl: "",
      },
    });
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

  router.get("/sites/domains", requireWorker, async (req, res) => {
    try {
      res.json(await listDomains(req.worker));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message });
    }
  });

  router.get("/sites/domains/:id", requireWorker, async (req, res) => {
    try {
      res.json(await getDomainDetail(req.worker, req.params.id));
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
        await createLink(req.worker, req.params.id, {
          path: req.body?.path,
          templateId: req.body?.templateId,
          windowType: req.body?.windowType,
        })
      );
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
        payoutMethod: req.worker.payoutMethod || "",
        payoutAddress: req.worker.payoutAddress || "",
      },
      methods,
      minWithdrawalUsd: env.walletMinWithdrawalUsd,
      supportUrl: env.supportUrl || "",
    });
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

  return router;
}

module.exports = { createUserRouter };
