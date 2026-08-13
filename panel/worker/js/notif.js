window.WorkerNotif = (function () {
  const READ_KEY = "worker_notif_read_v1";
  const HIDDEN_KEY = "worker_notif_hidden_v1";
  const BOOT_KEY = "worker_notif_boot_v2";
  const NEW_USER_MS = 7 * 24 * 60 * 60 * 1000;

  let userCtx = { telegramId: "anon", createdAt: null };

  function userScope() {
    return String(userCtx.telegramId || "anon");
  }

  function storageKey(base) {
    return `${base}:${userScope()}`;
  }

  function readIdSet(base) {
    try {
      const raw = localStorage.getItem(storageKey(base));
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) {
      return new Set();
    }
  }

  function writeIdSet(base, set) {
    try {
      localStorage.setItem(storageKey(base), JSON.stringify([...set].slice(-300)));
    } catch (_) {}
  }

  function isBootstrapped() {
    try {
      return localStorage.getItem(storageKey(BOOT_KEY)) === "1";
    } catch (_) {
      return false;
    }
  }

  function markBootstrapped() {
    try {
      localStorage.setItem(storageKey(BOOT_KEY), "1");
    } catch (_) {}
  }

  function isNewUser() {
    const created = userCtx.createdAt ? new Date(userCtx.createdAt).getTime() : 0;
    if (!Number.isFinite(created) || created <= 0) return true;
    return Date.now() - created < NEW_USER_MS;
  }

  /**
   * New workers: on first open, hide the current alert snapshot so
   * historical bans/pauses are not shown. Later alerts (new ids) appear normally.
   * Existing workers: no hiding — only read/unread state.
   */
  function bootstrapIfNeeded(items) {
    if (isBootstrapped()) return;
    markBootstrapped();
    if (!isNewUser()) return;
    const hidden = readIdSet(HIDDEN_KEY);
    (items || []).forEach((item) => hidden.add(String(item.id)));
    writeIdSet(HIDDEN_KEY, hidden);
  }

  function markRead(id) {
    const set = readIdSet(READ_KEY);
    set.add(String(id));
    writeIdSet(READ_KEY, set);
  }

  function markAllRead(ids) {
    const set = readIdSet(READ_KEY);
    (ids || []).forEach((id) => set.add(String(id)));
    writeIdSet(READ_KEY, set);
  }

  function isRead(id) {
    return readIdSet(READ_KEY).has(String(id));
  }

  function isHidden(id) {
    return readIdSet(HIDDEN_KEY).has(String(id));
  }

  function unreadCount(items) {
    return (items || []).filter((item) => !item.read).length;
  }

  async function fetchAlerts({ force = false } = {}) {
    const data = await WorkerAPI.get("/alerts", { force });
    const raw = Array.isArray(data?.alerts) ? data.alerts : [];
    bootstrapIfNeeded(raw);
    return raw
      .filter((item) => !isHidden(item.id))
      .map((item) => ({
        ...item,
        read: isRead(item.id),
      }));
  }

  function setUserContext(userOrId, createdAt) {
    if (userOrId && typeof userOrId === "object") {
      userCtx = {
        telegramId: String(userOrId.telegramId || "anon"),
        createdAt: userOrId.createdAt || null,
      };
      return;
    }
    userCtx = {
      telegramId: userOrId ? String(userOrId) : "anon",
      createdAt: createdAt || null,
    };
  }

  return {
    fetchAlerts,
    markRead,
    markAllRead,
    isRead,
    unreadCount,
    setUserContext,
  };
})();
