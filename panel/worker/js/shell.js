(async function () {
  WorkerPrefs.init();

  try {
    const tg = WorkerAuth.getTelegramWebApp?.();
    tg?.ready?.();
    tg?.expand?.();
  } catch (_) {}

  const user = await WorkerAuth.requireAuth();
  if (!user) return;

  let panelConfig = {};
  try {
    panelConfig = await WorkerAuth.getConfig();
    if (panelConfig.usdRubRate) WorkerPrefs.setRate(panelConfig.usdRubRate);
  } catch (_) {}

  const main = document.getElementById("main");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const statsEl = document.getElementById("userStats");
  const profileMenu = document.getElementById("profileMenu");
  const profileTrigger = document.getElementById("profileMenuTrigger");

  const VIEWS = {
    dashboard: WorkerViews.dashboard,
    sites: WorkerViews.sites,
    analytics: WorkerViews.analytics,
    top: WorkerViews.top,
    settings: WorkerViews.settings,
    wallet: WorkerViews.wallet,
    support: WorkerViews.support,
  };

  const VIEW_TITLE_KEYS = {
    dashboard: "nav.dashboard",
    sites: "nav.sites",
    analytics: "nav.analytics",
    top: "nav.top",
    wallet: "nav.wallet",
    settings: "nav.settings",
    support: "nav.support",
  };

  const SETTINGS_TABS = new Set([
    "profile",
    "password",
    "security",
    "appearance",
    "interface",
    "payouts",
  ]);

  let currentView = "dashboard";
  let profileMenuOpen = false;

  function updateDocumentTitle(viewId) {
    const key = VIEW_TITLE_KEYS[viewId] || VIEW_TITLE_KEYS.dashboard;
    const page = WorkerI18n.t(key);
    const brand = WorkerI18n.t("brand.name");
    document.title = `${page} - ${brand}`;
  }

  function displayName() {
    return user.username || user.firstName || user.telegramId;
  }

  function avatarUrl() {
    const photo = String(user.photoUrl || "").trim();
    if (/^https?:\/\//i.test(photo)) return photo;
    const username = String(user.username || "")
      .trim()
      .replace(/^@/, "");
    if (/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      return `https://t.me/i/userpic/320/${username}.jpg`;
    }
    return "../assets/logo.png";
  }

  function statsLine() {
    const { currency } = WorkerPrefs.get();
    const usd = Number(user.walletUsd || 0);
    if (currency === "RUB") {
      const value = WorkerFormat.convertUsd(usd);
      const locale = WorkerPrefs.get().lang === "ru" ? "ru-RU" : "en-US";
      return `${value.toLocaleString(locale)} ₽`;
    }
    return `${usd.toFixed(2)} $`;
  }

  function updateUserHeader() {
    const name = displayName();
    const avatar = avatarUrl();

    document.getElementById("userName").textContent = name;
    statsEl.textContent = statsLine();

    const img = document.getElementById("userAvatar");
    if (img) {
      img.onerror = () => {
        img.onerror = null;
        img.src = "../assets/logo.png";
      };
      img.src = avatar;
    }
    if (profileTrigger) profileTrigger.dataset.tip = name;
  }

  function setProfileMenuOpen(open) {
    profileMenuOpen = open;
    profileMenu.hidden = !open;
    profileTrigger?.setAttribute("aria-expanded", String(open));
    profileTrigger?.classList.toggle("is-open", open);
    if (open && window.WorkerNotifMenu) WorkerNotifMenu.setOpen(false);
  }

  window.closeWorkerProfileMenu = () => setProfileMenuOpen(false);

  function setSidebarOpen(open) {
    sidebar.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-visible", open);
    document.body.classList.toggle("menu-open", open);
    if (!open) setProfileMenuOpen(false);
  }

  function syncNav(viewId) {
    document.querySelectorAll(".nav-item[data-view]").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === viewId);
    });
  }

  function bindHelpLink(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    const href = String(url || "").trim();
    if (!href) {
      el.classList.add("is-hidden");
      return;
    }
    el.href = href;
    el.classList.remove("is-hidden");
  }

  function setupHelpLinks() {
    bindHelpLink(
      "profileGettingStarted",
      panelConfig.manualsDocsUrl || panelConfig.aboutInfoChannelUrl
    );
  }

  function openSettings(tab) {
    setProfileMenuOpen(false);
    if (tab && SETTINGS_TABS.has(tab)) {
      WorkerViews.settingsTab = tab;
    }
    showView("settings");
  }

  async function logout() {
    setProfileMenuOpen(false);
    await WorkerAuth.logout();
    location.replace("login.html");
  }

  async function showView(id, { refresh = false } = {}) {
    const viewId = VIEWS[id] ? id : "dashboard";
    currentView = viewId;

    if (viewId !== "sites" && WorkerViews.sitesState) {
      WorkerViews.sitesState.selectedId = null;
    }

    syncNav(viewId);
    updateDocumentTitle(viewId);
    setSidebarOpen(false);

    const hash =
      viewId === "settings" && WorkerViews.settingsTab
        ? `#settings/${WorkerViews.settingsTab}`
        : `#${viewId}`;
    history.replaceState(null, "", hash);

    try {
      await VIEWS[viewId]({ main, user, refresh });
    } catch (error) {
      if (window.WorkerToast) WorkerToast.error(error);
      main.innerHTML = `
        <div class="section">
          <div class="empty">
            <div>${WorkerFormat.escapeHtml(WorkerI18n.t("common.error"))}</div>
            <div class="muted">${WorkerFormat.escapeHtml(
              (window.WorkerToast && WorkerToast.friendlyError(error)) ||
                error.message ||
                String(error)
            )}</div>
          </div>
        </div>`;
    }
  }

  async function refreshNotifBadge(preloaded) {
    if (window.WorkerNotifMenu) {
      if (preloaded) WorkerNotifMenu.updateBadge(preloaded);
      else await WorkerNotifMenu.refreshBadge();
      return;
    }
  }
  window.refreshNotifBadge = refreshNotifBadge;

  function updateSidebarCollapseUi() {
    const collapsed = !!WorkerPrefs.get().sidebarCollapsed;
    const btn = document.getElementById("sidebarCollapse");
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(collapsed));
    const label = WorkerI18n.t(collapsed ? "nav.expand" : "nav.collapse");
    btn.setAttribute("aria-label", label);
    btn.dataset.tip = label;
  }

  function syncNavTips() {
    document.querySelectorAll(".nav-item").forEach((el) => {
      const label = el.querySelector("span")?.textContent?.trim();
      if (label) el.dataset.tip = label;
    });
    if (profileTrigger) {
      profileTrigger.dataset.tip = displayName();
    }
    const notifBell = document.getElementById("notifBell");
    if (notifBell) {
      const tip = WorkerI18n.t("nav.notifications");
      notifBell.dataset.tip = tip;
      notifBell.setAttribute("aria-label", tip);
    }
    updateSidebarCollapseUi();
  }

  function applyShellI18n() {
    WorkerI18n.apply(document);
    updateUserHeader();
    updateDocumentTitle(currentView);
    syncNavTips();
  }

  WorkerPrefs.onChange((_prefs, meta = {}) => {
    const keys = meta.keys || [];
    if (keys.length === 1 && keys[0] === "sidebarCollapsed") {
      updateSidebarCollapseUi();
      setProfileMenuOpen(false);
      return;
    }
    applyShellI18n();
    if (currentView === "settings") {
      showView("settings", { refresh: true });
      return;
    }
    showView(currentView, { refresh: false });
  });

  document.getElementById("menuToggle")?.addEventListener("click", () => setSidebarOpen(true));
  document.getElementById("sidebarClose")?.addEventListener("click", () => setSidebarOpen(false));
  backdrop?.addEventListener("click", () => setSidebarOpen(false));

  document.getElementById("sidebarCollapse")?.addEventListener("click", () => {
    WorkerPrefs.toggleSidebarCollapsed();
  });

  profileTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    setProfileMenuOpen(!profileMenuOpen);
  });

  document.addEventListener("click", (e) => {
    if (!profileMenuOpen) return;
    if (profileTrigger?.contains(e.target) || profileMenu?.contains(e.target)) return;
    setProfileMenuOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && profileMenuOpen) setProfileMenuOpen(false);
  });

  document.getElementById("profileSettingsBtn")?.addEventListener("click", () => openSettings());
  document.getElementById("profileSupportBtn")?.addEventListener("click", () => {
    setProfileMenuOpen(false);
    const bot = String(panelConfig.botUsername || "").replace(/^@/, "").trim();
    const url =
      String(panelConfig.supportUrl || "").trim() ||
      (bot ? `https://t.me/${bot}?start=feedback` : "https://t.me/Garbonabot?start=feedback");
    window.open(url, "_blank", "noopener,noreferrer");
  });
  document.getElementById("profileLogoutBtn")?.addEventListener("click", logout);

  document.getElementById("nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn || btn.disabled) return;
    showView(btn.dataset.view);
  });

  setupHelpLinks();
  applyShellI18n();

  if (window.WorkerNotif) {
    WorkerNotif.setUserContext(user);
  }
  if (window.WorkerNotifMenu) {
    WorkerNotifMenu.bind();
    WorkerNotifMenu.refreshBadge();
  }

  const hashRaw = (location.hash || "").replace(/^#/, "");
  const [viewId, settingsTab] = hashRaw.split("/");
  if (viewId === "settings" && SETTINGS_TABS.has(settingsTab)) {
    WorkerViews.settingsTab = settingsTab;
  }
  const initialView =
    viewId === "notifications" || viewId === "logs" ? "dashboard" : viewId || "dashboard";
  await showView(initialView);
})();
