(async function () {
  const user = await GarbonaPanelAuth.requireAuth();
  if (!user) return;

  PanelMember.mount();

  const TITLES = {
    overview: "Обзор",
    users: "Участники",
    comms: "Коммуникация",
    stats: "Статистика",
    apps: "Заявки",
    economy: "Экономика",
    sites: "Сайты",
    templates: "Шаблоны",
    payouts: "Выплаты",
    steam: "Логи Steam",
    botlogs: "Логи бота",
  };

  const main = document.getElementById("main");
  const pageTitle = document.getElementById("pageTitle");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  const mobileNav = document.getElementById("mobileNav");
  const PRIMARY_MOBILE_VIEWS = new Set(["overview", "users", "apps", "payouts"]);
  let statsPeriod = "all";
  let appsKind = "pending";

  document.getElementById("userName").textContent =
    user.firstName || user.username || user.telegramId;
  document.getElementById("userRole").textContent = user.roleLabel || "Админ";

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await GarbonaPanelAuth.logout();
    location.replace("login.html");
  });

  function setSidebarOpen(open) {
    sidebar.classList.toggle("is-open", open);
    backdrop.classList.toggle("is-visible", open);
    document.body.classList.toggle("menu-open", open);
  }

  function syncMobileNav(viewId) {
    if (!mobileNav) return;
    const moreActive = !PRIMARY_MOBILE_VIEWS.has(viewId);
    mobileNav.querySelectorAll(".mobile-nav-item").forEach((el) => {
      if (el.dataset.menu === "more") {
        el.classList.toggle("is-active", moreActive);
      } else {
        el.classList.toggle("is-active", el.dataset.view === viewId);
      }
    });
  }

  document.getElementById("menuToggle").addEventListener("click", () => setSidebarOpen(true));
  document.getElementById("sidebarClose").addEventListener("click", () => setSidebarOpen(false));
  backdrop.addEventListener("click", () => setSidebarOpen(false));

  mobileNav?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mobile-nav-item");
    if (!btn) return;
    if (btn.dataset.menu === "more") {
      setSidebarOpen(true);
      return;
    }
    if (btn.dataset.view) showView(btn.dataset.view);
  });

  function toast(msg, type) {
    PanelMember.toast(msg, type);
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  async function showView(id) {
    const viewId = TITLES[id] ? id : "overview";
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("is-active", el.dataset.view === viewId);
    });
    syncMobileNav(viewId);
    pageTitle.textContent = TITLES[viewId];
    setSidebarOpen(false);
    history.replaceState(null, "", `#${viewId}`);
    main.innerHTML = `<div class="greeting"><h1 class="greeting-title">Загрузка…</h1></div>`;
    try {
      if (viewId === "overview") await renderOverview();
      else if (viewId === "users") await renderUsers();
      else if (viewId === "stats") await renderStats();
      else if (viewId === "economy") await renderEconomy();
      else if (viewId === "sites") await renderSites();
      else if (viewId === "templates") await renderTemplates();
      else if (viewId === "apps") await renderApps();
      else if (viewId === "comms") await renderComms();
      else if (viewId === "payouts") await renderPayouts();
      else if (viewId === "steam") await renderSteam();
      else if (viewId === "botlogs") await renderBotLogs();
    } catch (e) {
      main.innerHTML = `<div class="empty"><div class="empty-title">Ошибка</div><div class="empty-sub">${e.message}</div></div>`;
    }
  }

  document.getElementById("nav").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (btn) showView(btn.dataset.view);
  });

  async function openMember(telegramId) {
    const data = await PanelAPI.get(`/admin/members/${telegramId}`);
    PanelMember.open(data.member, {
      onUpdated: () => {
        if (location.hash === "#users") renderUsers();
        if (location.hash === "#stats") renderStats();
      },
    });
  }

  async function renderOverview() {
    const data = await PanelAPI.get("/admin/overview");
    const k = data.kpi;
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Добро пожаловать, <em>${escapeHtml(
            user.firstName || user.username || "admin"
          )}</em></h1>
          <p class="greeting-sub">Сводка Garbona · глобальный % ${data.globalPercent}</p>
        </div>
        <button type="button" class="btn-primary" data-goto="users">Участники</button>
      </div>
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-label">В команде</div>
          <div class="stat-value">${k.teamCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Заявки в очереди</div>
          <div class="stat-value">${k.pendingApps}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Профиты сегодня</div>
          <div class="stat-value">${escapeHtml(k.todayProfitDisplay)}</div>
          <div class="stat-hint ${k.todayProfitDeltaPct > 0 ? "up" : k.todayProfitDeltaPct < 0 ? "down" : ""}">
            ${k.todayProfitDeltaPct == null ? "нет базы для сравнения" : `${k.todayProfitDeltaPct > 0 ? "+" : ""}${k.todayProfitDeltaPct}% к вчера`}
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Выводы</div>
          <div class="stat-value">${k.pendingPayouts}</div>
          <div class="stat-hint">на модерации</div>
        </div>
      </div>
      <div class="kpi-chart-card">
        <div class="kpi-chart-head">
          <div class="kpi-chart-label">Профиты за 7 дней</div>
          <div class="kpi-chart-value">${escapeHtml(k.todayProfitDisplay)}</div>
        </div>
        <div id="overviewChart"></div>
      </div>
    `;
    main.querySelector("[data-goto]")?.addEventListener("click", () => showView("users"));
    PanelCharts.renderBarChart(
      document.getElementById("overviewChart"),
      (data.series || []).map((s) => ({
        label: s.label,
        shortLabel: s.label,
        value: s.totalUsd,
        display: s.totalDisplay,
        count: s.count,
        detail: `${s.totalDisplay} · ${s.count} проф.`,
      })),
      { empty: "Пока нет профитов" }
    );
  }

  async function renderUsers() {
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Участники</h1>
          <p class="greeting-sub">Поиск и управление</p>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <div class="search-row">
            <input class="search-input" id="userSearch" type="search" placeholder="ID или @username" />
            <button type="button" class="btn-primary" id="userSearchBtn">Найти</button>
          </div>
          <div class="drawer-actions" style="margin-bottom:12px">
            <button type="button" class="btn-ghost" data-list="team">Команда</button>
            <button type="button" class="btn-ghost" data-list="curators">Кураторы</button>
            <button type="button" class="btn-ghost" data-list="callers">Прозвонщицы</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr><th>Участник</th><th>Роль</th><th>Статус</th><th>Кошелёк</th></tr>
              </thead>
              <tbody id="usersBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    async function load(mode = "team", q = "") {
      let data;
      if (mode === "curators") data = await PanelAPI.get("/admin/members/roles/curators");
      else if (mode === "callers") data = await PanelAPI.get("/admin/members/roles/callers");
      else data = await PanelAPI.get(`/admin/members${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      const body = document.getElementById("usersBody");
      body.innerHTML = "";
      (data.members || []).forEach((m) => {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.innerHTML = `
          <td>${m.username ? `@${escapeHtml(m.username)}` : m.telegramId}</td>
          <td class="muted">${roleOf(m)}</td>
          <td><span class="badge ${m.isBanned ? "bad" : m.isTeamMember ? "ok" : "wait"}">${
            m.isBanned ? "Бан" : m.isTeamMember ? "В команде" : "Вне"
          }</span></td>
          <td>${escapeHtml(m.walletDisplay)}</td>
        `;
        tr.addEventListener("click", () => openMember(m.telegramId));
        body.appendChild(tr);
      });
      if (!(data.members || []).length) {
        body.innerHTML = `<tr><td colspan="4" class="muted">Никого не найдено</td></tr>`;
      }
    }

    document.getElementById("userSearchBtn").addEventListener("click", () => {
      load("team", document.getElementById("userSearch").value.trim());
    });
    document.getElementById("userSearch").addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.getElementById("userSearchBtn").click();
    });
    main.querySelectorAll("[data-list]").forEach((b) => {
      b.addEventListener("click", () => load(b.dataset.list));
    });
    await load("team");
  }

  function roleOf(m) {
    if (m.isCurator) return "Куратор";
    if (m.isCaller) return "Прозвонщица";
    if (m.isModerator) return "Модер";
    if (m.isTeamMember) return "Воркер";
    return "—";
  }

  async function renderStats() {
    const [stats, top] = await Promise.all([
      PanelAPI.get(`/admin/stats?period=${statsPeriod}`),
      PanelAPI.get(`/admin/top?period=${statsPeriod}&limit=15`),
    ]);
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Статистика</h1>
          <p class="greeting-sub">Период: ${escapeHtml(stats.periodLabel)}</p>
        </div>
        <div class="period-pills" id="statsPeriods">
          ${["all", "24h", "7d", "30d"]
            .map(
              (p) =>
                `<button type="button" class="period-pill ${
                  p === statsPeriod ? "is-active" : ""
                }" data-period="${p}">${periodLabel(p)}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-card"><div class="stat-label">Команда</div><div class="stat-value">${stats.teamCount}</div></div>
        <div class="stat-card"><div class="stat-label">Заявки</div><div class="stat-value">${stats.applications.total}</div><div class="stat-hint">принят ${stats.applications.accepted} · откл ${stats.applications.rejected}</div></div>
        <div class="stat-card"><div class="stat-label">Профиты</div><div class="stat-value">${stats.profits.count}</div></div>
        <div class="stat-card"><div class="stat-label">Сумма</div><div class="stat-value">${escapeHtml(stats.profits.totalDisplay)}</div></div>
      </div>
      <div class="panel-card">
        <div class="panel-card-head"><h2 class="panel-card-title">Топ воркеров</h2></div>
        <div class="panel-card-body">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>#</th><th>Воркер</th><th>Профитов</th><th>Сумма</th></tr></thead>
              <tbody id="topBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const body = document.getElementById("topBody");
    (top.rows || []).forEach((r) => {
      const tr = document.createElement("tr");
      tr.className = "clickable-row";
      tr.innerHTML = `
        <td class="muted">${r.rank}</td>
        <td>${r.username ? `@${escapeHtml(r.username)}` : r.telegramId || "—"}</td>
        <td class="muted">${r.count}</td>
        <td>${escapeHtml(r.totalDisplay)}</td>
      `;
      if (r.telegramId) tr.addEventListener("click", () => openMember(r.telegramId));
      body.appendChild(tr);
    });
    if (!(top.rows || []).length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">Пока пусто</td></tr>`;
    }
    document.getElementById("statsPeriods").addEventListener("click", (e) => {
      const b = e.target.closest("[data-period]");
      if (!b) return;
      statsPeriod = b.dataset.period;
      renderStats();
    });
  }

  function periodLabel(p) {
    return { all: "Всё время", "24h": "24ч", "7d": "7д", "30d": "30д" }[p] || p;
  }

  async function renderEconomy() {
    const eco = await PanelAPI.get("/admin/economy");
    main.innerHTML = `
      <div class="settings-page">
        <div class="greeting">
          <div>
            <h1 class="greeting-title">Экономика</h1>
            <p class="greeting-sub">Глобальные параметры выплат и отображения</p>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Выплаты воркерам</h3>
            <span class="settings-section-desc">Влияет на всех участников</span>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Глобальный %</div>
                <div class="settings-row-desc">Процент от профита на баланс всем воркерам</div>
              </div>
              <div class="settings-row-control">
                <div class="settings-input-wrap">
                  <input class="settings-input" id="ecoPercent" type="number" min="1" max="100" value="${eco.globalPercent}" />
                  <span class="settings-suffix">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Отображение</h3>
            <span class="settings-section-desc">Только UI, балансы в USD</span>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Валюта</div>
                <div class="settings-row-desc">Формат сумм в боте и панели</div>
              </div>
              <div class="seg" id="ecoCurrency">
                <button type="button" class="seg-btn ${eco.currency === "USD" ? "is-active" : ""}" data-cur="USD">USD</button>
                <button type="button" class="seg-btn ${eco.currency === "RUB" ? "is-active" : ""}" data-cur="RUB">RUB</button>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Курс USD→RUB</div>
                <div class="settings-row-desc">Используется при валюте RUB</div>
              </div>
              <div class="settings-row-control">
                <div class="settings-input-wrap">
                  <input class="settings-input" id="ecoRate" type="number" min="0.01" step="0.01" value="${eco.rate}" />
                  <span class="settings-suffix">₽</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Имитация</h3>
            <span class="settings-section-desc">Косметические посты в каналы / ЛС</span>
          </div>
          <div class="settings-card">
            <div class="settings-card-body">
              <div class="settings-row-title">Фейк-профит</div>
              <div class="settings-row-desc">7 скинов CS2 — по одному названию на строку (как на Steam Market)</div>
              <textarea class="settings-textarea" id="fakeProfitText">AK-47 | Redline (Field-Tested)
AWP | Asiimov (Field-Tested)
M4A1-S | Hot Rod (Factory New)
USP-S | Kill Confirmed (Minimal Wear)
Glock-18 | Fade (Factory New)
Desert Eagle | Blaze (Factory New)
MAC-10 | Neon Rider (Factory New)</textarea>
              <div class="drawer-actions">
                <label class="check-label">
                  <input type="checkbox" class="check-input" id="fakeProfitAnon" />
                  <span class="check-box" aria-hidden="true"></span>
                  <span>Анонимно</span>
                </label>
                <input class="search-input" id="fakeProfitOwner" placeholder="Telegram ID владельца" />
                <button type="button" class="btn-primary" id="fakeProfitBtn">Отправить</button>
              </div>
            </div>
          </div>
          <div class="settings-card">
            <div class="settings-card-body">
              <div class="settings-row-title">Фейк-лог</div>
              <div class="settings-row-desc">Лимит, баланс, инвентарь, уровень, актив, игры — по строке</div>
              <textarea class="settings-textarea" id="fakeLogText">лимит: Нет
баланс: 12.50
инвентарь: 150.00
уровень: 42
актив: 2024-08-15
игры: 8</textarea>
              <div class="drawer-actions">
                <input class="search-input" id="fakeLogOwner" placeholder="Telegram ID получателя" />
                <button type="button" class="btn-primary" id="fakeLogBtn">Отправить в ЛС</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const savePercent = debounce(async () => {
      try {
        await PanelAPI.patch("/admin/economy", {
          globalPercent: Number(document.getElementById("ecoPercent").value),
        });
        toast("Глобальный % сохранён");
      } catch (e) {
        toast(e.message, "error");
      }
    }, 400);

    const saveRate = debounce(async () => {
      try {
        await PanelAPI.patch("/admin/economy", {
          rate: Number(document.getElementById("ecoRate").value),
        });
        toast("Курс сохранён");
      } catch (e) {
        toast(e.message, "error");
      }
    }, 400);

    document.getElementById("ecoPercent").addEventListener("change", savePercent);
    document.getElementById("ecoPercent").addEventListener("input", savePercent);
    document.getElementById("ecoRate").addEventListener("change", saveRate);
    document.getElementById("ecoRate").addEventListener("input", saveRate);

    document.getElementById("ecoCurrency").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cur]");
      if (!b) return;
      try {
        await PanelAPI.patch("/admin/economy", { currency: b.dataset.cur });
        toast(`Валюта: ${b.dataset.cur}`);
        renderEconomy();
      } catch (err) {
        toast(err.message, "error");
      }
    });

    document.getElementById("fakeProfitBtn").addEventListener("click", async () => {
      try {
        await PanelAPI.post("/admin/economy/fake-profit", {
          text: document.getElementById("fakeProfitText").value,
          anonymous: document.getElementById("fakeProfitAnon").checked,
          ownerTelegramId: document.getElementById("fakeProfitOwner").value.trim(),
        });
        toast("Фейк-профит отправлен");
      } catch (e) {
        toast(e.message, "error");
      }
    });

    document.getElementById("fakeLogBtn").addEventListener("click", async () => {
      try {
        await PanelAPI.post("/admin/economy/fake-log", {
          text: document.getElementById("fakeLogText").value,
          ownerTelegramId: document.getElementById("fakeLogOwner").value.trim(),
        });
        toast("Фейк-лог отправлен");
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }

  async function renderApps() {
    const data = await PanelAPI.get(`/admin/apps?kind=${appsKind}&page=0`);
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Заявки</h1>
          <p class="greeting-sub">Всего: ${data.total}</p>
        </div>
        <div class="period-pills">
          <button type="button" class="period-pill ${appsKind === "pending" ? "is-active" : ""}" data-kind="pending">Очередь</button>
          <button type="button" class="period-pill ${appsKind === "closed" ? "is-active" : ""}" data-kind="closed">Закрытые</button>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>ID</th><th>Юзер</th><th>Статус</th><th></th></tr></thead>
              <tbody id="appsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const body = document.getElementById("appsBody");
    (data.apps || []).forEach((a) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted"><code>${a.id.slice(-6)}</code></td>
        <td>${a.username ? `@${escapeHtml(a.username)}` : a.telegramId || "—"}</td>
        <td><span class="badge ${a.status === "accepted" ? "ok" : a.status === "rejected" ? "bad" : "wait"}">${a.status}</span></td>
        <td class="drawer-actions"></td>
      `;
      const cell = tr.lastElementChild;
      if (a.status === "pending") {
        const ok = document.createElement("button");
        ok.className = "btn-primary";
        ok.textContent = "Принять";
        ok.onclick = async () => {
          try {
            await PanelAPI.post(`/admin/apps/${a.id}/decide`, { action: "accept" });
            toast("Принято");
            renderApps();
          } catch (e) {
            toast(e.message, "error");
          }
        };
        const no = document.createElement("button");
        no.className = "btn-ghost btn-danger";
        no.textContent = "Отклонить";
        no.onclick = async () => {
          try {
            await PanelAPI.post(`/admin/apps/${a.id}/decide`, { action: "reject" });
            toast("Отклонено");
            renderApps();
          } catch (e) {
            toast(e.message, "error");
          }
        };
        cell.append(ok, no);
      }
      if (a.telegramId) {
        const open = document.createElement("button");
        open.className = "btn-ghost";
        open.textContent = "Карточка";
        open.onclick = () => openMember(a.telegramId);
        cell.appendChild(open);
      }
      body.appendChild(tr);
    });
    if (!(data.apps || []).length) {
      body.innerHTML = `<tr><td colspan="4" class="muted">Пусто</td></tr>`;
    }
    main.querySelectorAll("[data-kind]").forEach((b) => {
      b.addEventListener("click", () => {
        appsKind = b.dataset.kind;
        renderApps();
      });
    });
  }

  async function renderComms() {
    let recipients = { count: 0 };
    try {
      recipients = await PanelAPI.get("/admin/comms/recipients");
    } catch (_) {
      /* ignore */
    }
    main.innerHTML = `
      <div class="settings-page">
        <div class="greeting">
          <div>
            <h1 class="greeting-title">Коммуникация</h1>
            <p class="greeting-sub">Получателей рассылки: ${recipients.count}</p>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Рассылка</h3>
            <span class="settings-section-desc">Текст всем участникам команды</span>
          </div>
          <div class="settings-card">
            <div class="settings-card-body">
              <textarea class="settings-textarea" id="broadcastText" placeholder="HTML-текст…"></textarea>
              <button type="button" class="btn-primary" id="broadcastBtn">Отправить</button>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Мануалы</h3>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Тред мануалов</div>
                <div class="settings-row-desc">Создать / обновить форум-тред</div>
              </div>
              <button type="button" class="btn-primary" id="manualsBtn">Запустить</button>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Анонс</h3>
            <span class="settings-section-desc">Канал info · -1003600501278</span>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Первый анонс бота</div>
                <div class="settings-row-desc">Сетка 3×3 (9 фото) + текст + кнопки</div>
              </div>
              <button type="button" class="btn-primary" id="launchAnnounceBtn">Опубликовать</button>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Changelog</h3>
            <span class="settings-section-desc">Нужен CHANGELOGS_CHAT_ID в .env</span>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Опубликовать changelog</div>
                <div class="settings-row-desc">Monospace (&lt;pre&gt;) в канал changelogs</div>
              </div>
              <button type="button" class="btn-primary" id="changelogBtn">Опубликовать</button>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <div class="settings-section-label">
            <h3 class="settings-section-title">Динамический закреп</h3>
            <span class="settings-section-desc">Чат воркеров · автообновление</span>
          </div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Обновить Live Pin</div>
                <div class="settings-row-desc">Стафф, профиты сегодня, курс, статус API</div>
              </div>
              <button type="button" class="btn-primary" id="dynamicPinBtn">Обновить</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById("broadcastBtn").addEventListener("click", async () => {
      if (!confirm("Отправить рассылку всем?")) return;
      try {
        const result = await PanelAPI.post("/admin/comms/broadcast", {
          text: document.getElementById("broadcastText").value,
        });
        toast(`Готово: ${JSON.stringify(result.result || result)}`);
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("manualsBtn").addEventListener("click", async () => {
      try {
        await PanelAPI.post("/admin/comms/manuals-thread", {});
        toast("Тред обновлён");
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("launchAnnounceBtn").addEventListener("click", async () => {
      if (!confirm("Опубликовать анонс бота в info-канал?")) return;
      try {
        const data = await PanelAPI.post("/admin/comms/launch-announce", {});
        const r = data.result || data;
        toast(`Опубликовано · msg ${r.messageId || "ok"}${r.pinned ? " · закреплено" : ""}`);
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("changelogBtn").addEventListener("click", async () => {
      if (!confirm("Опубликовать changelog в канал?")) return;
      try {
        const data = await PanelAPI.post("/admin/comms/changelog", {});
        const r = data.result || data;
        toast(`Changelog · msg ${r.messageId || "ok"}${r.pinned ? " · закреплено" : ""}`);
      } catch (e) {
        toast(e.message, "error");
      }
    });
    document.getElementById("dynamicPinBtn").addEventListener("click", async () => {
      try {
        const data = await PanelAPI.post("/admin/comms/dynamic-pin", {});
        const r = data.result || data;
        toast(`Live Pin · ${r.refreshed ? "обновлён" : "создан"} · ${r.messageId || "ok"}`);
      } catch (e) {
        toast(e.message, "error");
      }
    });
  }

  async function renderPayouts() {
    const data = await PanelAPI.get("/admin/payouts?status=open");
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Выплаты</h1>
          <p class="greeting-sub">Очередь модерации</p>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <div class="table-wrap">
            <table class="data">
              <thead><tr><th>ID</th><th>Юзер</th><th>Сумма</th><th>Метод</th><th>Статус</th><th></th></tr></thead>
              <tbody id="payoutsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const body = document.getElementById("payoutsBody");
    (data.payouts || []).forEach((p) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="muted"><code>${String(p.id).slice(-6)}</code></td>
        <td>${p.telegramId || "—"}</td>
        <td>$${Number(p.amountUsd).toFixed(2)}</td>
        <td class="muted">${escapeHtml(p.method)}</td>
        <td><span class="badge wait">${p.status}</span></td>
        <td class="drawer-actions"></td>
      `;
      const cell = tr.lastElementChild;
      if (p.status === "pending") {
        const a = document.createElement("button");
        a.className = "btn-primary";
        a.textContent = "Одобрить";
        a.onclick = async () => {
          try {
            await PanelAPI.post(`/admin/payouts/${p.id}/approve`, {});
            toast("Ожидает ссылку");
            renderPayouts();
          } catch (e) {
            toast(e.message, "error");
          }
        };
        cell.appendChild(a);
      }
      if (p.status === "awaiting_payout_link") {
        const input = document.createElement("input");
        input.className = "search-input";
        input.placeholder = "https://…";
        input.style.width = "140px";
        const send = document.createElement("button");
        send.className = "btn-primary";
        send.textContent = "Ссылка";
        send.onclick = async () => {
          try {
            await PanelAPI.post(`/admin/payouts/${p.id}/link`, { url: input.value });
            toast("Выплата завершена");
            renderPayouts();
          } catch (e) {
            toast(e.message, "error");
          }
        };
        cell.append(input, send);
      }
      const rej = document.createElement("button");
      rej.className = "btn-ghost btn-danger";
      rej.textContent = "Отклонить";
      rej.onclick = async () => {
        try {
          await PanelAPI.post(`/admin/payouts/${p.id}/reject`, {});
          toast("Отклонено");
          renderPayouts();
        } catch (e) {
          toast(e.message, "error");
        }
      };
      cell.appendChild(rej);
      if (p.telegramId) {
        const card = document.createElement("button");
        card.className = "btn-ghost";
        card.textContent = "Юзер";
        card.onclick = () => openMember(p.telegramId);
        cell.appendChild(card);
      }
      body.appendChild(tr);
    });
    if (!(data.payouts || []).length) {
      body.innerHTML = `<tr><td colspan="6" class="muted">Очередь пуста</td></tr>`;
    }
  }

  async function renderSites() {
    let sitesTab = "domains";
    let selectedDomainId = null;

    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Сайты</h1>
          <p class="greeting-sub" id="sitesSub">Панель доменов и воркеров uproject</p>
        </div>
        <div class="period-pills" id="sitesTabs">
          <button type="button" class="period-pill is-active" data-sites-tab="domains">Домены</button>
          <button type="button" class="period-pill" data-sites-tab="templates">Шаблоны</button>
          <button type="button" class="period-pill" data-sites-tab="workers">Воркеры</button>
        </div>
      </div>
      <div id="sitesBody"></div>
    `;

    const body = document.getElementById("sitesBody");
    const sub = document.getElementById("sitesSub");

    document.getElementById("sitesTabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-sites-tab]");
      if (!btn) return;
      sitesTab = btn.dataset.sitesTab;
      selectedDomainId = null;
      document.querySelectorAll("#sitesTabs .period-pill").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.sitesTab === sitesTab);
      });
      load();
    });

    async function load() {
      body.innerHTML = `<div class="panel-card"><div class="panel-card-body"><div class="muted">Загрузка…</div></div></div>`;
      try {
        if (sitesTab === "workers") await renderWorkers();
        else if (sitesTab === "templates") await renderTemplatesVisibility();
        else if (selectedDomainId) await renderDomainDetail(selectedDomainId);
        else await renderDomains();
      } catch (e) {
        body.innerHTML = `
          <div class="panel-card">
            <div class="panel-card-body">
              <div class="empty">
                <div class="empty-title">Не удалось открыть сайты</div>
                <div class="empty-sub">${escapeHtml(e.message)}</div>
                <p class="muted" style="margin:12px 0 0">Нужен аккаунт панели сайтов у текущего админа (создайте в карточке участника).</p>
              </div>
            </div>
          </div>`;
      }
    }

    async function renderDomains() {
      const data = await PanelAPI.get("/admin/sites/domains");
      sub.textContent = `Аккаунт: ${data.panelUsername || "—"} · доменов ${data.domains?.length || 0} · онлайн ${data.totalOnline || 0}`;
      body.innerHTML = `
        <div class="panel-card">
          <div class="panel-card-body" style="padding-top:16px">
            <div class="search-row">
              <input class="search-input" id="siteDomainInput" placeholder="новый-домен.com" />
              <button type="button" class="btn-ghost" id="siteDomainCheck">Проверить</button>
              <button type="button" class="btn-primary" id="siteDomainAdd">Добавить</button>
            </div>
            <div class="muted" id="siteDomainHint" style="margin-bottom:12px"></div>
            <div class="table-wrap">
              <table class="data">
                <thead>
                  <tr><th>Домен</th><th>Онлайн</th><th>Тип</th><th>ID</th></tr>
                </thead>
                <tbody id="sitesDomainsBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      const tbody = document.getElementById("sitesDomainsBody");
      (data.domains || []).forEach((d) => {
        const tr = document.createElement("tr");
        tr.className = "clickable-row";
        tr.innerHTML = `
          <td>${escapeHtml(d.domain)}</td>
          <td>${d.online}</td>
          <td class="muted">${d.isOwn ? "свой" : d.isTeamPublic ? "командный" : "—"}</td>
          <td class="muted">${d.id}</td>
        `;
        tr.addEventListener("click", () => {
          selectedDomainId = d.id;
          load();
        });
        tbody.appendChild(tr);
      });
      if (!(data.domains || []).length) {
        tbody.innerHTML = `<tr><td colspan="4" class="muted">Доменов пока нет</td></tr>`;
      }

      const hint = document.getElementById("siteDomainHint");
      document.getElementById("siteDomainCheck").addEventListener("click", async () => {
        try {
          const domain = document.getElementById("siteDomainInput").value.trim();
          const preview = await PanelAPI.post("/admin/sites/domains/check", { domain });
          hint.textContent = `Свободен. A-запись → ${preview.ip || "—"}`;
          toast("Домен свободен");
        } catch (e) {
          hint.textContent = e.message;
          toast(e.message, "error");
        }
      });
      document.getElementById("siteDomainAdd").addEventListener("click", async () => {
        try {
          const domain = document.getElementById("siteDomainInput").value.trim();
          const result = await PanelAPI.post("/admin/sites/domains", { domain });
          toast(`Добавлен ${result.created?.domain || domain}`);
          selectedDomainId = result.created?.id || null;
          await load();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    }

    async function renderDomainDetail(domainId) {
      const [detail, templatesData] = await Promise.all([
        PanelAPI.get(`/admin/sites/domains/${domainId}`),
        PanelAPI.get("/admin/sites/templates").catch(() => ({ templates: [] })),
      ]);
      const d = detail.domain;
      sub.textContent = d.domain;
      const templates = templatesData.templates || [];
      body.innerHTML = `
        <div class="panel-card">
          <div class="panel-card-head">
            <h2 class="panel-card-title">${escapeHtml(d.domain)}</h2>
            <button type="button" class="panel-card-link" id="sitesBack">← К списку</button>
          </div>
          <div class="panel-card-body">
            <div class="meta-grid" style="margin-bottom:16px">
              <div><dt>ID</dt><dd>${d.id}</dd></div>
              <div><dt>Онлайн</dt><dd>${d.online}</dd></div>
              <div><dt>Тип</dt><dd>${d.isOwn ? "свой" : "командный"}</dd></div>
              <div><dt>IP</dt><dd>${escapeHtml(d.ip || "—")}</dd></div>
            </div>
            <div class="settings-row-title" style="margin-bottom:8px">Создать ссылку</div>
            <div class="search-row">
              <input class="search-input" id="siteLinkPath" placeholder="path (пусто = random)" />
              <select class="search-input" id="siteLinkTemplate" style="max-width:220px">
                <option value="">${templates.length ? "Шаблон…" : "Нет доступных шаблонов"}</option>
                ${templates
                  .map(
                    (t) =>
                      `<option value="${t.id}">${escapeHtml(t.name || `Template #${t.id}`)} (#${t.id})</option>`
                  )
                  .join("")}
              </select>
              <select class="search-input" id="siteLinkWindow" style="max-width:160px">
                <option value="FakeWindow">FakeWindow</option>
                <option value="CurrentWindow">CurrentWindow</option>
                <option value="NewWindow">NewWindow</option>
                <option value="AboutBlank">AboutBlank</option>
              </select>
              <button type="button" class="btn-primary" id="siteLinkCreate">Создать</button>
            </div>
            <div class="table-wrap" style="margin-top:8px">
              <table class="data">
                <thead><tr><th>Path</th><th>Окно</th><th>Шаблон</th><th>ID</th></tr></thead>
                <tbody id="siteLinksBody"></tbody>
              </table>
            </div>
            ${
              d.isOwn
                ? `<div class="drawer-actions" style="margin-top:16px"><button type="button" class="btn-ghost btn-danger" id="siteDomainDelete">Удалить домен</button></div>`
                : ""
            }
          </div>
        </div>
      `;
      const linksBody = document.getElementById("siteLinksBody");
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
        selectedDomainId = null;
        load();
      });
      document.getElementById("siteLinkCreate").addEventListener("click", async () => {
        try {
          await PanelAPI.post(`/admin/sites/domains/${domainId}/links`, {
            path: document.getElementById("siteLinkPath").value.trim(),
            templateId: document.getElementById("siteLinkTemplate").value,
            windowType: document.getElementById("siteLinkWindow").value,
          });
          toast("Ссылка создана");
          await renderDomainDetail(domainId);
        } catch (e) {
          toast(e.message, "error");
        }
      });
      document.getElementById("siteDomainDelete")?.addEventListener("click", async () => {
        if (!confirm(`Удалить домен ${d.domain}?`)) return;
        try {
          await PanelAPI.del(`/admin/sites/domains/${domainId}`);
          toast("Домен удалён");
          selectedDomainId = null;
          await load();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    }

    async function renderWorkers() {
      const data = await PanelAPI.get("/admin/sites/workers");
      sub.textContent = `Воркеры uproject · ${data.workers?.length || 0}`;
      body.innerHTML = `
        <div class="panel-card">
          <div class="panel-card-body" style="padding-top:16px">
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Логин</th><th>Telegram</th><th>ID</th><th></th></tr></thead>
                <tbody id="siteWorkersBody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      const tbody = document.getElementById("siteWorkersBody");
      (data.workers || []).forEach((w) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(w.username || "—")}${w.isOwner ? ' <span class="badge ok">вы</span>' : ""}</td>
          <td class="muted">${escapeHtml(w.telegram || "—")}</td>
          <td class="muted">${w.id ?? "—"}</td>
          <td></td>
        `;
        if (w.telegram) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn-ghost";
          btn.textContent = "Юзер";
          btn.addEventListener("click", () => openMember(String(w.telegram)));
          tr.lastElementChild.appendChild(btn);
        }
        tbody.appendChild(tr);
      });
      if (!(data.workers || []).length) {
        tbody.innerHTML = `<tr><td colspan="4" class="muted">Пусто</td></tr>`;
      }
    }

    async function renderTemplatesVisibility() {
      await mountTemplatesVisibility(body, {
        onMeta: (text) => {
          sub.textContent = text;
        },
      });
    }

    await load();
  }

  async function renderTemplates() {
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Шаблоны</h1>
          <p class="greeting-sub" id="templatesSub">Какие шаблоны видны в боте и панелях</p>
        </div>
      </div>
      <div id="templatesBody"></div>
    `;
    await mountTemplatesVisibility(document.getElementById("templatesBody"), {
      onMeta: (text) => {
        const el = document.getElementById("templatesSub");
        if (el) el.textContent = text;
      },
    });
  }

  async function mountTemplatesVisibility(container, { onMeta } = {}) {
    const data = await PanelAPI.get("/admin/sites/templates/visibility");
    const templates = data.templates || [];
    if (typeof onMeta === "function") onMeta(`Видимые шаблоны · ${templates.length}`);
    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <div class="settings-row-title" style="margin-bottom:4px">Доступные шаблоны</div>
          <div class="muted" style="margin-bottom:12px">
            Только включённые ID видны в боте и при создании ссылок${
              templates.length ? "." : ". Сейчас список пуст — шаблоны скрыты."
            }
          </div>
          <div class="search-row">
            <input class="search-input" id="siteTemplateIdInput" type="number" min="1" step="1" placeholder="ID шаблона, например 785" />
            <input class="search-input" id="siteTemplateNameInput" maxlength="80" placeholder="Своё название (необязательно)" />
            <button type="button" class="btn-primary" id="siteTemplateEnable">Включить</button>
          </div>
          <div class="table-wrap" style="margin-top:8px">
            <table class="data">
              <thead><tr><th>ID</th><th>Название</th><th>Превью</th><th></th></tr></thead>
              <tbody id="siteTemplatesBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    const tbody = document.getElementById("siteTemplatesBody");
    templates.forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><code>${t.id}</code></td>
        <td></td>
        <td class="muted">${
          t.preview
            ? `<a href="${escapeHtml(t.preview)}" target="_blank" rel="noopener">открыть</a>`
            : "—"
        }</td>
        <td></td>
      `;
      const nameCell = tr.children[1];
      const nameInput = document.createElement("input");
      nameInput.className = "search-input";
      nameInput.style.maxWidth = "220px";
      nameInput.maxLength = 80;
      nameInput.value = t.name || `Template #${t.id}`;
      nameInput.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return;
        const name = nameInput.value.trim();
        if (!name) {
          toast("Укажите название", "error");
          return;
        }
        try {
          await PanelAPI.patch(`/admin/sites/templates/visibility/${t.id}`, { name });
          toast(`Название #${t.id} обновлено`);
          await mountTemplatesVisibility(container, { onMeta });
        } catch (err) {
          toast(err.message, "error");
        }
      });
      nameCell.appendChild(nameInput);

      const actions = tr.lastElementChild;
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "btn-ghost";
      saveBtn.textContent = "Сохранить";
      saveBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        if (!name) {
          toast("Укажите название", "error");
          return;
        }
        try {
          await PanelAPI.patch(`/admin/sites/templates/visibility/${t.id}`, { name });
          toast(`Название #${t.id} обновлено`);
          await mountTemplatesVisibility(container, { onMeta });
        } catch (err) {
          toast(err.message, "error");
        }
      });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-ghost btn-danger";
      btn.textContent = "Выключить";
      btn.addEventListener("click", async () => {
        try {
          await PanelAPI.del(`/admin/sites/templates/visibility/${t.id}`);
          toast(`Шаблон #${t.id} выключен`);
          await mountTemplatesVisibility(container, { onMeta });
        } catch (e) {
          toast(e.message, "error");
        }
      });
      actions.appendChild(saveBtn);
      actions.appendChild(btn);
      tbody.appendChild(tr);
    });
    if (!templates.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Нет включённых шаблонов — пользователи их не видят</td></tr>`;
    }

    const enable = async () => {
      const id = document.getElementById("siteTemplateIdInput").value.trim();
      const name = document.getElementById("siteTemplateNameInput").value.trim();
      if (!id) {
        toast("Укажите ID шаблона", "error");
        return;
      }
      try {
        const result = await PanelAPI.post("/admin/sites/templates/visibility", { id, name });
        const savedName = result.template?.name || `#${id}`;
        toast(`Включён: ${savedName}`);
        document.getElementById("siteTemplateIdInput").value = "";
        document.getElementById("siteTemplateNameInput").value = "";
        await mountTemplatesVisibility(container, { onMeta });
      } catch (e) {
        toast(e.message, "error");
      }
    };
    document.getElementById("siteTemplateEnable").addEventListener("click", enable);
    document.getElementById("siteTemplateIdInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") enable();
    });
    document.getElementById("siteTemplateNameInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") enable();
    });
  }

  async function renderSteam() {
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Логи Steam</h1>
          <p class="greeting-sub">Последние аккаунты панели · поиск по ID</p>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <div class="search-row">
            <input class="search-input" id="steamId" placeholder="ID лога (цифры) или оставьте пустым" />
            <button type="button" class="btn-primary" id="steamSearch">Найти</button>
            <button type="button" class="btn-ghost" id="steamRefresh">Обновить</button>
          </div>
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Логин</th>
                  <th>Статус</th>
                  <th>Владелец</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="steamBody">
                <tr><td colspan="5" class="muted">Загрузка…</td></tr>
              </tbody>
            </table>
          </div>
          <pre id="steamOut" hidden style="margin:14px 0 0;padding:12px;background:#202124;border-radius:10px;overflow:auto;font-size:12px;color:#b6b6b8;max-height:360px;white-space:pre-wrap"></pre>
        </div>
      </div>
    `;

    const body = document.getElementById("steamBody");
    const out = document.getElementById("steamOut");

    function rowCells(row) {
      const owner = row.owner?.telegram || row.owner?.username || "—";
      return `
        <td class="muted">${escapeHtml(row.id ?? "—")}</td>
        <td>${escapeHtml(row.username || "—")}</td>
        <td><span class="badge ${/invalid|невалид/i.test(String(row.status || "")) ? "bad" : "ok"}">${escapeHtml(
          row.status || "—"
        )}</span></td>
        <td class="muted">${escapeHtml(owner)}</td>
        <td></td>
      `;
    }

    async function loadList() {
      body.innerHTML = `<tr><td colspan="5" class="muted">Загрузка…</td></tr>`;
      out.hidden = true;
      try {
        const data = await PanelAPI.get("/admin/steam-logs");
        const rows = Array.isArray(data) ? data : data?.rows || data?.data || [];
        body.innerHTML = "";
        if (!rows.length) {
          body.innerHTML = `<tr><td colspan="5" class="muted">Логи не найдены</td></tr>`;
          return;
        }
        rows.forEach((row) => {
          const tr = document.createElement("tr");
          tr.className = "clickable-row";
          tr.innerHTML = rowCells(row);
          const btnCell = tr.lastElementChild;
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "btn-ghost";
          openBtn.textContent = "JSON";
          openBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            out.hidden = false;
            out.textContent = JSON.stringify(row, null, 2);
          });
          btnCell.appendChild(openBtn);
          tr.addEventListener("click", () => {
            document.getElementById("steamId").value = String(row.id || "");
            loadById(String(row.id || ""));
          });
          body.appendChild(tr);
        });
      } catch (e) {
        body.innerHTML = `<tr><td colspan="5" class="muted">Ошибка: ${escapeHtml(e.message)}</td></tr>`;
        toast(e.message, "error");
      }
    }

    async function loadById(id) {
      if (!id) return loadList();
      body.innerHTML = `<tr><td colspan="5" class="muted">Загрузка #${escapeHtml(id)}…</td></tr>`;
      out.hidden = true;
      try {
        const data = await PanelAPI.get(`/admin/steam-logs?id=${encodeURIComponent(id)}`);
        const account = data?.account || data;
        body.innerHTML = "";
        const tr = document.createElement("tr");
        tr.innerHTML = rowCells(account);
        body.appendChild(tr);
        out.hidden = false;
        out.textContent = JSON.stringify(account, null, 2);
      } catch (e) {
        body.innerHTML = `<tr><td colspan="5" class="muted">Ошибка: ${escapeHtml(e.message)}</td></tr>`;
        toast(e.message, "error");
      }
    }

    document.getElementById("steamSearch").addEventListener("click", () => {
      loadById(document.getElementById("steamId").value.trim());
    });
    document.getElementById("steamRefresh").addEventListener("click", loadList);
    document.getElementById("steamId").addEventListener("keydown", (e) => {
      if (e.key === "Enter") loadById(e.target.value.trim());
    });
    await loadList();
  }

  async function renderBotLogs() {
    main.innerHTML = `
      <div class="greeting">
        <div>
          <h1 class="greeting-title">Логи бота</h1>
          <p class="greeting-sub">Последние 250 строк</p>
        </div>
        <button type="button" class="btn-primary" id="botLogsRefresh">Обновить</button>
      </div>
      <div class="panel-card">
        <div class="panel-card-body" style="padding-top:16px">
          <pre id="botLogsOut" style="margin:0;padding:12px;background:#202124;border-radius:10px;overflow:auto;font-size:12px;color:#b6b6b8;max-height:60vh;white-space:pre-wrap"></pre>
        </div>
      </div>
    `;
    async function load() {
      const text = await PanelAPI.get("/admin/bot-logs?lines=250");
      document.getElementById("botLogsOut").textContent = text;
    }
    document.getElementById("botLogsRefresh").addEventListener("click", load);
    await load();
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const hash = location.hash.replace(/^#/, "");
  await showView(hash || "overview");
})();
