window.WorkerViews = window.WorkerViews || {};

WorkerViews.settingsTab = "profile";

WorkerViews.settings = async function renderSettings(ctx) {
  const { main, user } = ctx;
  const tab = WorkerViews.settingsTab || "profile";

  main.innerHTML = `
    <h1 class="page-greeting">${WorkerI18n.t("settings.title")}</h1>
    <p class="page-subtitle">${WorkerI18n.t("settings.subtitle")}</p>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="${WorkerFormat.escapeHtml(WorkerI18n.t("settings.title"))}">
        ${settingsNavItem("profile", "settings.tabProfile")}
        ${settingsNavItem("password", "settings.tabPassword")}
        ${settingsNavItem("security", "settings.tabSecurity")}
        ${settingsNavItem("appearance", "settings.tabAppearance")}
        ${settingsNavItem("interface", "settings.tabInterface")}
        ${settingsNavItem("payouts", "settings.tabPayouts")}
      </nav>
      <div class="settings-panels">
        <div class="settings-panel" data-settings-panel="profile" ${tab !== "profile" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.tabProfile")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.profileDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label" for="settingsLogin">${WorkerI18n.t("settings.login")}</label>
              <input class="input" id="settingsLogin" type="text" readonly />
              <p class="settings-hint">${WorkerI18n.t("settings.loginHint")}</p>
            </div>
            <div class="settings-field">
              <label class="settings-label" for="settingsBio">${WorkerI18n.t("settings.bio")}</label>
              <textarea class="textarea" id="settingsBio" maxlength="500" rows="3"></textarea>
            </div>
            <div class="settings-toggle-row">
              <div>
                <div class="settings-toggle-label">${WorkerI18n.t("settings.hideInRating")}</div>
                <p class="settings-hint">${WorkerI18n.t("settings.hideInRatingHint")}</p>
              </div>
              <label class="toggle">
                <input type="checkbox" id="settingsAnonymous" />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="settings-actions">
              <button type="button" class="btn btn-primary" id="settingsProfileSave">${WorkerI18n.t("settings.save")}</button>
              <span class="settings-status" id="settingsProfileStatus" hidden></span>
            </div>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="password" ${tab !== "password" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.passwordTitle")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.passwordDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label" for="settingsPasswordLogin">${WorkerI18n.t("settings.login")}</label>
              <input class="input" id="settingsPasswordLogin" type="text" readonly />
              <p class="settings-hint">${WorkerI18n.t("settings.loginHint")}</p>
            </div>
            <div class="settings-field" id="settingsCurrentPasswordWrap">
              <label class="settings-label" for="settingsCurrentPassword">${WorkerI18n.t("settings.currentPassword")}</label>
              <input class="input" id="settingsCurrentPassword" type="password" autocomplete="current-password" />
            </div>
            <div class="settings-field">
              <label class="settings-label" for="settingsNewPassword">${WorkerI18n.t("settings.newPassword")}</label>
              <input class="input" id="settingsNewPassword" type="password" autocomplete="new-password" />
            </div>
            <div class="settings-field">
              <label class="settings-label" for="settingsConfirmPassword">${WorkerI18n.t("settings.confirmPassword")}</label>
              <input class="input" id="settingsConfirmPassword" type="password" autocomplete="new-password" />
            </div>
            <p class="settings-hint" id="settingsPasswordHint"></p>
            <div class="settings-actions">
              <button type="button" class="btn btn-primary" id="settingsPasswordSave">${WorkerI18n.t("settings.passwordSave")}</button>
              <span class="settings-status" id="settingsPasswordStatus" hidden></span>
            </div>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="security" ${tab !== "security" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.securityTitle")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.securityDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-status-row">
              <span class="badge badge-off">${WorkerI18n.t("settings.securityOff")}</span>
            </div>
            <p class="settings-hint">${WorkerI18n.t("settings.securityHint")}</p>
            <div class="settings-soon-card">
              <button type="button" class="btn btn-ghost" disabled>${WorkerI18n.t("settings.securityEnable")}</button>
              <span class="badge-soon">${WorkerI18n.t("nav.soon")}</span>
            </div>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="appearance" ${tab !== "appearance" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.tabAppearance")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.appearanceDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label">${WorkerI18n.t("settings.theme")}</label>
              <div class="settings-segments" id="settingsThemeSegments">
                <button type="button" class="settings-segment" data-pref="theme" data-value="light">${WorkerI18n.t("settings.themeLight")}</button>
                <button type="button" class="settings-segment" data-pref="theme" data-value="dark">${WorkerI18n.t("settings.themeDark")}</button>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="interface" ${tab !== "interface" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.tabInterface")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.interfaceDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label">${WorkerI18n.t("settings.language")}</label>
              <div class="settings-segments" id="settingsLangSegments">
                <button type="button" class="settings-segment" data-pref="lang" data-value="ru">RU</button>
                <button type="button" class="settings-segment" data-pref="lang" data-value="en">EN</button>
              </div>
            </div>
            <div class="settings-field">
              <label class="settings-label">${WorkerI18n.t("settings.currency")}</label>
              <div class="settings-segments" id="settingsCurrencySegments">
                <button type="button" class="settings-segment" data-pref="currency" data-value="USD">USD</button>
                <button type="button" class="settings-segment" data-pref="currency" data-value="RUB">RUB</button>
              </div>
            </div>
            <div class="settings-field">
              <label class="settings-label">${WorkerI18n.t("settings.defaultPeriod")}</label>
              <div class="settings-segments" id="settingsPeriodSegments">
                <button type="button" class="settings-segment" data-pref="defaultPeriod" data-value="7">${WorkerI18n.t("dashboard.period7")}</button>
                <button type="button" class="settings-segment" data-pref="defaultPeriod" data-value="14">${WorkerI18n.t("dashboard.period14")}</button>
                <button type="button" class="settings-segment" data-pref="defaultPeriod" data-value="30">${WorkerI18n.t("dashboard.period30")}</button>
              </div>
              <p class="settings-hint">${WorkerI18n.t("settings.defaultPeriodHint")}</p>
            </div>
          </div>
        </div>

        <div class="settings-panel" data-settings-panel="payouts" ${tab !== "payouts" ? "hidden" : ""}>
          <div class="settings-panel-head">
            <h2 class="settings-panel-title">${WorkerI18n.t("settings.tabPayouts")}</h2>
            <p class="settings-panel-desc">${WorkerI18n.t("settings.payoutsDesc")}</p>
          </div>
          <div class="settings-form">
            <div class="settings-field">
              <label class="settings-label">${WorkerI18n.t("settings.payoutMethod")}</label>
              <div id="settingsPayoutMethod" class="custom-select-host"></div>
            </div>
            <div class="settings-field">
              <label class="settings-label" for="settingsPayoutAddress">${WorkerI18n.t("settings.payoutAddress")}</label>
              <input class="input" id="settingsPayoutAddress" type="text" autocomplete="off" />
              <p class="settings-hint" id="settingsPayoutFee"></p>
            </div>
            <div class="settings-actions">
              <button type="button" class="btn btn-primary" id="settingsPayoutsSave">${WorkerI18n.t("settings.save")}</button>
              <span class="settings-status" id="settingsPayoutsStatus" hidden></span>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  bindSettingsNav(main);
  syncPrefSegments(main);
  await loadSettingsData(main, user);
};

function settingsNavItem(id, i18nKey) {
  const active = WorkerViews.settingsTab === id ? " is-active" : "";
  return `<button type="button" class="settings-tab${active}" data-settings-tab="${id}">${WorkerI18n.t(i18nKey)}</button>`;
}

function bindSettingsNav(root) {
  root.querySelectorAll("[data-settings-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      WorkerViews.settingsTab = btn.dataset.settingsTab;
      history.replaceState(null, "", `#settings/${WorkerViews.settingsTab}`);
      root.querySelectorAll(".settings-tab").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.settingsTab === WorkerViews.settingsTab);
      });
      root.querySelectorAll("[data-settings-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.settingsPanel !== WorkerViews.settingsTab;
      });
    });
  });

  root.querySelectorAll("[data-pref]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.pref;
      let value = btn.dataset.value;
      if (key === "defaultPeriod") value = Number(value);
      WorkerPrefs.set({ [key]: value });
      syncPrefSegments(root);
      if (key === "defaultPeriod") {
        WorkerViews.dashboardPeriodDays = value;
      }
    });
  });
}

function syncPrefSegments(root) {
  const prefs = WorkerPrefs.get();
  root.querySelectorAll("[data-pref]").forEach((btn) => {
    const key = btn.dataset.pref;
    const raw = btn.dataset.value;
    const value = key === "defaultPeriod" ? Number(raw) : raw;
    const current = key === "defaultPeriod" ? prefs.defaultPeriod : prefs[key];
    btn.classList.toggle("is-active", String(current) === String(value));
  });
}

function setSettingsStatus(id, text, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle("is-error", !ok);
  el.classList.toggle("is-ok", ok);
  if (text) {
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }
}

async function loadSettingsData(root, user) {
  let data;
  try {
    data = await WorkerAPI.get("/settings");
  } catch (error) {
    root.querySelector(".settings-panels").innerHTML = `
      <div class="section"><div class="empty">
        <div>${WorkerFormat.escapeHtml(WorkerI18n.t("common.error"))}</div>
        <div class="muted">${WorkerFormat.escapeHtml(error.message || String(error))}</div>
      </div></div>`;
    return;
  }

  const u = data.user || user;
  const login = u.username || u.appLogin || u.telegramId || "—";
  const telegram = u.username ? `@${u.username}` : u.telegramId || "—";

  const loginEl = document.getElementById("settingsLogin");
  if (loginEl) loginEl.value = login;

  const passwordLoginEl = document.getElementById("settingsPasswordLogin");
  if (passwordLoginEl) passwordLoginEl.value = u.appLogin || login;

  let hasAppPassword = Boolean(u.hasAppPassword);
  const currentWrap = document.getElementById("settingsCurrentPasswordWrap");
  const passwordHint = document.getElementById("settingsPasswordHint");
  const currentInput = document.getElementById("settingsCurrentPassword");
  const newInput = document.getElementById("settingsNewPassword");
  const confirmInput = document.getElementById("settingsConfirmPassword");

  function paintPasswordForm() {
    if (currentWrap) currentWrap.hidden = !hasAppPassword;
    if (passwordHint) {
      passwordHint.textContent = hasAppPassword
        ? WorkerI18n.t("settings.passwordChangeHint")
        : WorkerI18n.t("settings.passwordSetHint");
    }
  }
  paintPasswordForm();

  document.getElementById("settingsPasswordSave")?.addEventListener("click", async () => {
    const payload = {
      newPassword: newInput?.value || "",
      confirmPassword: confirmInput?.value || "",
    };
    if (hasAppPassword) {
      payload.currentPassword = currentInput?.value || "";
    }
    try {
      await WorkerAPI.post("/settings/password", payload);
      if (currentInput) currentInput.value = "";
      if (newInput) newInput.value = "";
      if (confirmInput) confirmInput.value = "";
      hasAppPassword = true;
      paintPasswordForm();
      setSettingsStatus("settingsPasswordStatus", WorkerI18n.t("settings.passwordSaved"), true);
    } catch (error) {
      setSettingsStatus("settingsPasswordStatus", error.message || WorkerI18n.t("common.error"), false);
    }
  });

  const bioEl = document.getElementById("settingsBio");
  if (bioEl) bioEl.value = u.bio || "";

  const anonEl = document.getElementById("settingsAnonymous");
  if (anonEl) anonEl.checked = Boolean(u.isAnonymous);

  document.getElementById("settingsProfileSave")?.addEventListener("click", async () => {
    try {
      const payload = {
        bio: document.getElementById("settingsBio")?.value || "",
        isAnonymous: Boolean(document.getElementById("settingsAnonymous")?.checked),
      };
      const res = await WorkerAPI.patch("/settings", payload);
      if (res.user) {
        Object.assign(user, res.user);
      }
      setSettingsStatus("settingsProfileStatus", WorkerI18n.t("settings.saved"), true);
    } catch (error) {
      setSettingsStatus("settingsProfileStatus", error.message || WorkerI18n.t("common.error"), false);
    }
  });

  const methods = (data.methods || []).map((m) => ({
    value: m.id,
    label: m.label,
    feeUsd: m.feeUsd,
  }));
  const payoutState = {
    method: u.payoutMethod || methods[0]?.value || "",
    address: u.payoutAddress || "",
  };

  const addressEl = document.getElementById("settingsPayoutAddress");
  if (addressEl) addressEl.value = payoutState.address;

  function updateFeeHint() {
    const feeEl = document.getElementById("settingsPayoutFee");
    if (!feeEl) return;
    const meta = methods.find((m) => m.value === payoutState.method);
    const fee = meta?.feeUsd;
    feeEl.textContent =
      fee != null && fee > 0
        ? WorkerI18n.t("settings.payoutFee", { fee: WorkerFormat.money(fee) })
        : WorkerI18n.t("settings.payoutFeeNone");
  }

  let payoutSelect = null;
  if (methods.length) {
    payoutSelect = WorkerDropdown.mount(document.getElementById("settingsPayoutMethod"), {
      value: payoutState.method,
      ariaLabel: WorkerI18n.t("settings.payoutMethod"),
      options: methods.map((m) => ({ value: m.value, label: m.label })),
      onChange: (value) => {
        payoutState.method = value;
        updateFeeHint();
      },
    });
    updateFeeHint();
  } else {
    document.getElementById("settingsPayoutMethod").innerHTML = `<span class="muted">${WorkerI18n.t("common.empty")}</span>`;
  }

  document.getElementById("settingsPayoutsSave")?.addEventListener("click", async () => {
    try {
      payoutState.address = addressEl?.value?.trim() || "";
      const res = await WorkerAPI.patch("/settings", {
        payoutMethod: payoutState.method,
        payoutAddress: payoutState.address,
      });
      if (res.user) Object.assign(user, res.user);
      setSettingsStatus("settingsPayoutsStatus", WorkerI18n.t("settings.saved"), true);
    } catch (error) {
      setSettingsStatus("settingsPayoutsStatus", error.message || WorkerI18n.t("common.error"), false);
    }
  });
}
