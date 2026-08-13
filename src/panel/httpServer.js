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
  const appRoot = path.resolve(panelRoot, "app");
  const workerRoot = path.resolve(panelRoot, "worker");

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use("/api/user", createUserRouter(bot));
  app.use("/api", createPanelRouter(bot));

  app.use("/app", express.static(appRoot, { index: false, extensions: ["html"] }));
  app.get(["/app", "/app/"], (_req, res) => {
    res.redirect("/app/index.html");
  });

  app.use("/worker", express.static(workerRoot, { index: false, extensions: ["html"] }));
  app.get(["/worker", "/worker/"], (_req, res) => {
    res.redirect("/worker/index.html");
  });

  // HTML/JS панели — без долгого кэша, чтобы админка сразу подхватывала обновления UI.
  app.use((req, res, next) => {
    if (/\.(?:html?|js)$/i.test(req.path) || req.path === "/" || req.path === "") {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  app.use(express.static(panelRoot, { index: false, extensions: ["html"] }));

  app.get("/", (_req, res) => {
    res.redirect("/index.html");
  });

  const port = Number(env.panelPort) || 8787;
  const host = "0.0.0.0";
  const server = app.listen(port, host, () => {
    const publicUrl = env.panelPublicUrl || `http://127.0.0.1:${port}`;
    logger.info(`Panel server listening on http://${host}:${port} → ${publicUrl}`);
    logger.info(`Worker app: ${publicUrl}/app/`);
    logger.info(`Worker panel v2: ${publicUrl}/worker/`);
  });

  return server;
}

module.exports = { startPanelServer };
