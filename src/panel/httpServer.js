const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { createPanelRouter } = require("./routes");
const { createUserRouter } = require("./userRoutes");

function startPanelServer(bot) {
  const app = express();
  const panelRoot = path.resolve(__dirname, "../../panel");
  const workerRoot = path.resolve(panelRoot, "worker");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use("/api/user", createUserRouter(bot));
  app.use("/api", createPanelRouter(bot));

  // Worker App (бывший v2) — основной интерфейс воркера
  app.use("/app", express.static(workerRoot, { index: false, extensions: ["html"] }));
  app.get(["/app", "/app/"], (_req, res) => {
    res.redirect("/app/index.html");
  });
  app.use("/app", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    res.status(404).sendFile(path.join(workerRoot, "404.html"));
  });

  // Старый URL /worker → /app
  app.use("/worker", (req, res) => {
    const suffix = req.url && req.url !== "/" ? req.url : "/";
    res.redirect(301, `/app${suffix}`);
  });

  // HTML/JS панели — без долгого кэша, чтобы админка сразу подхватывала обновления UI.
  app.use((req, res, next) => {
    if (/\.(?:html?|js)$/i.test(req.path) || req.path === "/" || req.path === "") {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Админ-панель (panel/*) — не трогаем
  app.use(express.static(panelRoot, { index: false, extensions: ["html"] }));

  app.get("/", (_req, res) => {
    res.redirect("/index.html");
  });

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "not_found" });
    }
    res.status(404).sendFile(path.join(workerRoot, "404.html"));
  });

  const port = Number(env.panelPort) || 8787;
  const host = "0.0.0.0";
  const server = app.listen(port, host, () => {
    const publicUrl = env.panelPublicUrl || `http://127.0.0.1:${port}`;
    logger.info(`Panel server listening on http://${host}:${port} → ${publicUrl}`);
    logger.info(`Admin panel: ${publicUrl}/`);
    logger.info(`Worker app: ${publicUrl}/app/`);
  });

  return server;
}

module.exports = { startPanelServer };
