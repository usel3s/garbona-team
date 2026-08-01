window.PanelMember = (function () {
  let current = null;
  let onUpdated = null;

  function toast(message, type = "ok") {
    const host = document.getElementById("toastHost");
    if (!host) return;
    const el = document.createElement("div");
    el.className = `toast is-${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function open(member, opts = {}) {
    current = member;
    onUpdated = opts.onUpdated || null;
    render();
    document.getElementById("drawer").classList.add("is-open");
    document.getElementById("drawerBackdrop").classList.add("is-open");
  }

  function close() {
    document.getElementById("drawer").classList.remove("is-open");
    document.getElementById("drawerBackdrop").classList.remove("is-open");
    current = null;
  }

  async function reload() {
    if (!current) return;
    const data = await PanelAPI.get(`/admin/members/${current.telegramId}`);
    current = data.member;
    render();
    if (onUpdated) onUpdated(current);
  }

  function switchBtn(on, attrs) {
    return `<button type="button" class="switch ${on ? "is-on" : ""}" ${attrs}><span class="switch-handle"></span></button>`;
  }

  function render() {
    const m = current;
    const body = document.getElementById("drawerBody");
    if (!m || !body) return;

    document.getElementById("drawerTitle").textContent =
      m.username ? `@${m.username}` : `ID ${m.telegramId}`;

    body.innerHTML = `
      <dl class="meta-grid">
        <dt>Telegram ID</dt><dd><code>${m.telegramId}</code></dd>
        <dt>Роль</dt><dd>${m.role}</dd>
        <dt>Кошелёк</dt><dd>${m.walletDisplay}</dd>
        <dt>Процент</dt><dd>${m.profitPercent}%</dd>
        <dt>Панель</dt><dd>${m.panelUsername ? `<code>${m.panelUsername}:${m.panelPassword || "—"}</code>` : "не создан"}</dd>
        <dt>Статус</dt><dd>${m.isBanned ? "Бан" : m.isTeamMember ? "В команде" : "Вне команды"}</dd>
      </dl>

      <div class="settings-section">
        <div class="settings-section-label">
          <h3 class="settings-section-title">Роли</h3>
          <span class="settings-section-desc">Флаги участника</span>
        </div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Куратор</div>
              <div class="settings-row-desc">Публичная роль куратора</div>
            </div>
            ${switchBtn(m.isCurator, 'data-role="curator"')}
          </div>
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Прозвонщица</div>
              <div class="settings-row-desc">Публичная роль прозвона</div>
            </div>
            ${switchBtn(m.isCaller, 'data-role="caller"')}
          </div>
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Модератор</div>
              <div class="settings-row-desc">Права модерации в чатах</div>
            </div>
            ${switchBtn(m.isModerator, 'data-role="moderator"')}
          </div>
        </div>
      </div>

      ${m.isCurator ? roleSettings("curator", m) : ""}
      ${m.isCaller ? roleSettings("caller", m) : ""}

      <div class="settings-section">
        <div class="settings-section-label">
          <h3 class="settings-section-title">Финансы</h3>
        </div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Процент воркера</div>
              <div class="settings-row-desc">Доля от профита на баланс</div>
            </div>
            <div class="settings-row-control">
              <div class="settings-input-wrap">
                <input class="settings-input" type="number" min="1" max="100" id="mPercent" value="${m.profitPercent}" />
                <span class="settings-suffix">%</span>
              </div>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="settings-row-title">Начислить профит (gross $)</div>
            <div class="drawer-actions">
              <div class="settings-input-wrap" style="flex:1">
                <input class="settings-input" style="width:100%" type="number" min="0.01" step="0.01" id="mProfit" placeholder="100" />
                <span class="settings-suffix">$</span>
              </div>
              <button type="button" class="btn-primary" id="mProfitBtn">Профит</button>
            </div>
            <div class="settings-row-title">Пополнить кошелёк (USD)</div>
            <div class="drawer-actions">
              <div class="settings-input-wrap" style="flex:1">
                <input class="settings-input" style="width:100%" type="number" min="0.01" step="0.01" id="mWallet" placeholder="50" />
                <span class="settings-suffix">$</span>
              </div>
              <button type="button" class="btn-primary" id="mWalletBtn">Топап</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">
          <h3 class="settings-section-title">Панель сайтов</h3>
        </div>
        <div class="settings-card">
          <div class="settings-card-body">
            <div class="drawer-actions">
              <button type="button" class="btn-ghost" data-panel="create">Создать</button>
              <button type="button" class="btn-ghost" data-panel="recreate">Пересоздать</button>
            </div>
            <div class="drawer-actions">
              <input class="search-input" id="mPanelLogin" placeholder="login" style="flex:1" />
              <input class="search-input" id="mPanelPass" placeholder="password" style="flex:1" />
              <button type="button" class="btn-primary" data-panel="bind">Привязать</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-label">
          <h3 class="settings-section-title">Сообщение</h3>
        </div>
        <div class="settings-card">
          <div class="settings-card-body">
            <textarea class="settings-textarea" id="mMsg" placeholder="Текст в ЛС…"></textarea>
            <button type="button" class="btn-primary" id="mMsgBtn">Отправить</button>
          </div>
        </div>
      </div>

      <div class="drawer-actions">
        <button type="button" class="btn-ghost" id="mKick">Исключить из команды</button>
        ${
          m.isBanned
            ? `<button type="button" class="btn-primary" id="mUnban">Разбанить</button>`
            : `<button type="button" class="btn-ghost btn-danger" id="mBan">Забанить</button>`
        }
      </div>
    `;

    bindEvents();
  }

  function roleSettings(kind, m) {
    const isCur = kind === "curator";
    const desc = isCur ? m.curatorDescription : m.callerDescription;
    const percent = isCur ? m.curatorPercent : m.callerPercent;
    const min = isCur ? m.curatorMinProfits : m.callerMinProfits;
    const title = isCur ? "Настройки куратора" : "Настройки прозвонщицы";
    return `
      <div class="settings-section">
        <div class="settings-section-label">
          <h3 class="settings-section-title">${title}</h3>
        </div>
        <div class="settings-card">
          <div class="settings-card-body">
            <textarea class="settings-textarea" data-cfg-desc="${kind}" placeholder="Описание">${escapeHtml(desc || "")}</textarea>
          </div>
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Процент</div>
            </div>
            <div class="settings-row-control">
              <div class="settings-input-wrap">
                <input class="settings-input" type="number" min="1" max="100" data-cfg-percent="${kind}" value="${percent}" />
                <span class="settings-suffix">%</span>
              </div>
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-row-text">
              <div class="settings-row-title">Мин. профитов</div>
            </div>
            <div class="settings-row-control">
              <div class="settings-input-wrap">
                <input class="settings-input" type="number" min="0" step="1" data-cfg-min="${kind}" value="${min}" />
              </div>
            </div>
          </div>
          <div class="settings-card-body">
            <button type="button" class="btn-primary" data-cfg-save="${kind}">Сохранить настройки</button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function bindEvents() {
    const id = current.telegramId;

    document.querySelectorAll("[data-role]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const role = btn.dataset.role;
        const next = !btn.classList.contains("is-on");
        try {
          await PanelAPI.post(`/admin/members/${id}/role`, { role, value: next });
          toast(next ? "Роль включена" : "Роль снята");
          await reload();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    });

    const percentInput = document.getElementById("mPercent");
    if (percentInput) {
      percentInput.addEventListener(
        "change",
        debounce(async () => {
          try {
            await PanelAPI.patch(`/admin/members/${id}/percent`, {
              percent: Number(percentInput.value),
            });
            toast("Процент сохранён");
            await reload();
          } catch (e) {
            toast(e.message, "error");
          }
        }, 400)
      );
    }

    document.getElementById("mProfitBtn")?.addEventListener("click", async () => {
      try {
        await PanelAPI.post(`/admin/members/${id}/profit`, {
          amount: Number(document.getElementById("mProfit").value),
        });
        toast("Профит начислен");
        await reload();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("mWalletBtn")?.addEventListener("click", async () => {
      try {
        await PanelAPI.post(`/admin/members/${id}/wallet`, {
          amount: Number(document.getElementById("mWallet").value),
        });
        toast("Кошелёк пополнен");
        await reload();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("mMsgBtn")?.addEventListener("click", async () => {
      try {
        await PanelAPI.post(`/admin/members/${id}/message`, {
          text: document.getElementById("mMsg").value,
        });
        toast("Сообщение отправлено");
        document.getElementById("mMsg").value = "";
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.querySelectorAll("[data-panel]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.dataset.panel;
        try {
          if (action === "bind") {
            await PanelAPI.post(`/admin/members/${id}/panel/bind`, {
              username: document.getElementById("mPanelLogin").value,
              password: document.getElementById("mPanelPass").value,
            });
          } else {
            await PanelAPI.post(`/admin/members/${id}/panel/${action}`, {});
          }
          toast("Панель обновлена");
          await reload();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    });

    document.querySelectorAll("[data-cfg-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const kind = btn.dataset.cfgSave;
        const path =
          kind === "curator"
            ? `/admin/members/${id}/curator-settings`
            : `/admin/members/${id}/caller-settings`;
        try {
          await PanelAPI.patch(path, {
            description: document.querySelector(`[data-cfg-desc="${kind}"]`)?.value,
            percent: Number(document.querySelector(`[data-cfg-percent="${kind}"]`)?.value),
            minProfits: Number(document.querySelector(`[data-cfg-min="${kind}"]`)?.value),
          });
          toast("Настройки сохранены");
          await reload();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    });

    document.getElementById("mKick")?.addEventListener("click", async () => {
      if (!confirm("Исключить из команды?")) return;
      try {
        await PanelAPI.post(`/admin/members/${id}/kick`, {});
        toast("Исключён");
        await reload();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("mBan")?.addEventListener("click", async () => {
      if (!confirm("Забанить пользователя?")) return;
      try {
        await PanelAPI.post(`/admin/members/${id}/ban`, { banned: true });
        toast("Забанен");
        await reload();
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("mUnban")?.addEventListener("click", async () => {
      try {
        await PanelAPI.post(`/admin/members/${id}/ban`, { banned: false });
        toast("Разбанен");
        await reload();
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }

  function mount() {
    document.getElementById("drawerClose")?.addEventListener("click", close);
    document.getElementById("drawerBackdrop")?.addEventListener("click", close);
  }

  return { open, close, mount, toast, reload };
})();
