window.WorkerAuth = (function () {
  async function getConfig() {
    return WorkerAPI.get("/config");
  }

  async function me() {
    return WorkerAPI.get("/me");
  }

  async function loginTelegram(payload) {
    return WorkerAPI.post("/auth/telegram", payload);
  }

  async function loginWebApp(initData) {
    return WorkerAPI.post("/auth/webapp", { initData });
  }

  async function logout() {
    return WorkerAPI.post("/auth/logout", {});
  }

  function getTelegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  async function tryWebAppLogin() {
    const tg = getTelegramWebApp();
    if (!tg) return false;
    try {
      tg.ready?.();
      tg.expand?.();
    } catch (_) {}
    const initData = String(tg.initData || "").trim();
    if (!initData) return false;
    await loginWebApp(initData);
    return true;
  }

  async function requireAuth() {
    try {
      const data = await me();
      return data.user;
    } catch (_) {
      try {
        if (await tryWebAppLogin()) {
          const data = await me();
          return data.user;
        }
      } catch (_) {}
      if (!/login\.html$/i.test(location.pathname)) {
        location.replace("login.html");
      }
      return null;
    }
  }

  return {
    getConfig,
    me,
    loginTelegram,
    loginWebApp,
    tryWebAppLogin,
    getTelegramWebApp,
    logout,
    requireAuth,
  };
})();
