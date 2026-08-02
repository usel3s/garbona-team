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

  async function logout() {
    return WorkerAPI.post("/auth/logout", {});
  }

  async function requireAuth() {
    try {
      const data = await me();
      return data.user;
    } catch (_) {
      if (!/login\.html$/i.test(location.pathname)) {
        location.replace("login.html");
      }
      return null;
    }
  }

  return { getConfig, me, loginTelegram, logout, requireAuth };
})();
