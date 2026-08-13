const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const { env } = require("../config/env");
const { logger } = require("../utils/logger");
const { createPanelRouter } = require("./routes");
const { createUserRouter } = require("./userRoutes");

const AUTH_WINDOW_MS = 60 * 1000;
const AUTH_MAX_HITS = 20;
const authHits = new Map();

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimitAuth(req, res, next) {
  const key = `${clientIp(req)}:${req.path}`;
  const now = Date.now();
  let bucket = authHits.get(key);
  if (!bucket || now - bucket.start > AUTH_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    authHits.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > AUTH_MAX_HITS) {
    return res.status(429).json({ error: "too_many_requests" });
  }
  return next();
}

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const publicUrl = String(env.panelPublicUrl || "").replace(/\/$/, "");
  if (publicUrl && origin === publicUrl) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "garbona.bothost.tech") return true;
    if (host === "localhost" || host === "127.0.0.1") return true;
  } catch (_) {
    return false;
  }
  return false;
}

function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.path.startsWith("/api")) return next();

  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();
  if (origin) {
    if (!isAllowedOrigin(origin)) {
      return res.status(403).json({ error: "forbidden_origin" });
    }
    return next();
  }
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (!isAllowedOrigin(refOrigin)) {
        return res.status(403).json({ error: "forbidden_origin" });
      }
      return next();
    } catch (_) {
      return res.status(403).json({ error: "forbidden_origin" });
    }
  }
  // Same-origin navigations / Telegram Login widget may omit Origin.
  // Allow when no Origin/Referer only for auth bootstrap endpoints.
  if (/\/auth\/telegram$/.test(req.path)) return next();
  return res.status(403).json({ error: "forbidden_origin" });
}

function securityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  if (String(env.panelPublicUrl || "").startsWith("https")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

function startPanelServer(bot) {
  const app = express();
  const panelRoot = path.resolve(__dirname, "../../panel");
  const workerRoot = path.resolve(panelRoot, "worker");

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(securityHeaders);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(csrfGuard);

  app.use("/api/user/auth/telegram", rateLimitAuth);
  app.use("/api/auth/telegram", rateLimitAuth);

  app.use("/api/user", createUserRouter(bot));
  app.use("/api", createPanelRouter(bot));

  // Worker App — основной интерфейс воркера
  app.use(
    "/app",
    express.static(workerRoot, { index: false, extensions: ["html"], dotfiles: "deny" })
  );
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

  app.use((req, res, next) => {
    if (/\.(?:html?|js)$/i.test(req.path) || req.path === "/" || req.path === "") {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });

  // Админ-панель
  app.use(
    express.static(panelRoot, {
      index: false,
      extensions: ["html"],
      dotfiles: "deny",
    })
  );

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

  const port = Number(env.panelPort) || 3000;
  const host = "0.0.0.0";
  const server = app.listen(port, host, () => {
    const publicUrl = env.panelPublicUrl || `http://127.0.0.1:${port}`;
    logger.info(`Panel server listening on http://${host}:${port} → ${publicUrl}`);
    logger.info(`Admin panel: ${publicUrl}/`);
    logger.info(`Worker app: ${publicUrl}/app/`);
    if (env.panelAuthDisabled) {
      logger.warn("PANEL_AUTH_DISABLED is ON — never use this on a public host");
    }
  });

  // occasional cleanup of rate-limit map
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of authHits) {
      if (now - bucket.start > AUTH_WINDOW_MS * 2) authHits.delete(key);
    }
  }, 60_000).unref?.();

  return server;
}

module.exports = { startPanelServer };
