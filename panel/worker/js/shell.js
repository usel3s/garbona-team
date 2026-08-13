(async function () {
  WorkerPrefs.init();

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
    settings: WorkerViews.settings,
    team: WorkerViews.team,
    wallet: WorkerViews.wallet,
    support: WorkerViews.support,
  };

  const VIEW_TITLE_KEYS = {
    dashboard: "nav.dashboard",
    logs: "nav.logs",
    sites: "nav.sites",
    tasks: "nav.tasks",
    team: "nav.team",
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
    return user.photoUrl || "../assets/logo.png";
  }

  function statsLine() {
    const pct = user.profitPercent ?? 80;
    const { currency } = WorkerPrefs.get();
    const usd = Number(user.walletUsd || 0);
    let amount;
    if (currency === "RUB") {
      const value = WorkerFormat.convertUsd(usd);
      const locale = WorkerPrefs.get().lang === "ru" ? "ru-RU" : "en-US";
      amount = `${value.toLocaleString(locale)} ₽`;
    } else {
      amount = `${usd.toFixed(2)} $`;
    }
    return `${amount} · ${pct}%`;
  }

  function updateUserHeader() {
    const name = displayName();
    const avatar = avatarUrl();

    document.getElementById("userName").textContent = name;
    statsEl.textContent = statsLine();

    const img = document.getElementById("userAvatar");
    if (img) img.src = avatar;
  }

  function setProfileMenuOpen(open) {
    profileMenuOpen = open;
    profileMenu.hidden = !open;
    profileTrigger?.setAttribute("aria-expanded", String(open));
    profileTrigger?.classList.toggle("is-open", open);
  }

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
    document.getElementById("sidebarSettings")?.classList.toggle("is-active", viewId === "settings");
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
    bindHelpLink("sidebarGettingStarted", panelConfig.manualsDocsUrl || panelConfig.aboutInfoChannelUrl);
    bindHelpLink("sidebarUpdates", panelConfig.changelogsUrl);
    bindHelpLink("sidebarSupport", panelConfig.supportUrl);
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
      main.innerHTML = `
        <div class="section">
          <div class="empty">
            <div>${WorkerFormat.escapeHtml(WorkerI18n.t("common.error"))}</div>
            <div class="muted">${WorkerFormat.escapeHtml(error.message || String(error))}</div>
          </div>
        </div>`;
    }
  }

  function applyShellI18n() {
    WorkerI18n.apply(document);
    updateUserHeader();
    updateDocumentTitle(currentView);
  }

  WorkerPrefs.onChange(() => {
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

  document.getElementById("sidebarSettings")?.addEventListener("click", () => openSettings());
  document.getElementById("profileLogoutBtn")?.addEventListener("click", logout);

  document.getElementById("nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn || btn.disabled) return;
    showView(btn.dataset.view);
  });

  setupHelpLinks();
  applyShellI18n();

  // Поддержка в панели — внутренний роут, а не внешний URL.
  document.getElementById("sidebarSupport")?.addEventListener("click", (e) => {
    e.preventDefault();
    showView("support");
  });

  const hashRaw = (location.hash || "").replace(/^#/, "");
  const [viewId, settingsTab] = hashRaw.split("/");
  if (viewId === "settings" && SETTINGS_TABS.has(settingsTab)) {
    WorkerViews.settingsTab = settingsTab;
  }
  await showView(viewId || "dashboard");
})();
