window.GarbonaPanelAuth = (function () {
  async function getConfig() {
    return PanelAPI.get("/config");
  }

  async function me() {
    return PanelAPI.get("/me");
  }

  async function loginTelegram(payload) {
    return PanelAPI.post("/auth/telegram", payload);
  }

  async function logout() {
    return PanelAPI.post("/auth/logout", {});
  }

  async function requireAuth() {
    try {
      const data = await me();
      return data.user;
    } catch (_) {
      try {
        const cfg = await getConfig();
        if (cfg.authDisabled) {
          location.replace("index.html");
          return null;
        }
      } catch (__) {
        /* ignore */
      }
      if (!/login\.html$/i.test(location.pathname)) {
        location.replace("login.html");
      }
      return null;
    }
  }

  return { getConfig, me, loginTelegram, logout, requireAuth };
})();
