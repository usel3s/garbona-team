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
  });

  return server;
}

module.exports = { startPanelServer };
