window.WorkerViews = window.WorkerViews || {};

WorkerViews.dashboardPeriodDays = WorkerPrefs.get().defaultPeriod || 7;
WorkerViews.eventsCache = [];
WorkerViews.eventsFilters = {
  sort: "date",
  dir: "desc",
};

WorkerViews.dashboard = async function renderDashboard(ctx) {
  const { main, user, refresh } = ctx;
  const days = WorkerViews.dashboardPeriodDays || 7;

  const data = await WorkerAPI.get(`/overview?days=${days}`, { force: !!refresh });
  const k = data.kpi || {};
  const u = data.user || {};
  const name = WorkerFormat.escapeHtml(user.firstName || user.username || user.telegramId);

  const logsError = data.logsError
    ? `<div class="inline-alert">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.logsError"))}</div>`
    : "";

  WorkerViews.eventsCache = buildRecentEvents(data.recentLogs || [], data.recentMafiles || []);
  const events = applyEventsSort(WorkerViews.eventsCache, WorkerViews.eventsFilters);

  const series = data.series || [];
  const sparkProfit = series.map((row) => Number(row.profitUsd || 0));
  const sparkLogs = series.map((row) => Number(row.logsCount || 0));
  const sparkMafile = series.map((row) => Number(row.mafileCount || 0));

  main.innerHTML = `
    <h1 class="page-greeting">${WorkerI18n.t("dashboard.greeting")} <em>${name}</em></h1>

    <section class="section section-stats">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("dashboard.statsTitle")}</h2>
        <div id="periodSelect" class="custom-select-host"></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-cell">
          <div class="kpi-cell-top">
            <span class="kpi-icon kpi-icon-profit" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M4 16.5 9.2 11l3.3 3.2L20 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.5 7.5H20V12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="kpi-label">${WorkerI18n.t("dashboard.profitTotal")}</div>
          </div>
          <div class="kpi-cell-main">
            <div class="kpi-cell-nums">
              <div class="kpi-value" data-money="${u.profitTotalUsd ?? u.walletUsd ?? 0}">${WorkerFormat.money(u.profitTotalUsd ?? u.walletUsd ?? 0)}</div>
              ${WorkerFormat.kpiDeltaHtml(k.profitTotalDeltaPct)}
            </div>
            ${renderSparkline(sparkProfit, "profit")}
          </div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-cell-top">
            <span class="kpi-icon kpi-icon-period" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="5.5" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </span>
            <div class="kpi-label">${WorkerI18n.t("dashboard.profitPeriod")}</div>
          </div>
          <div class="kpi-cell-main">
            <div class="kpi-cell-nums">
              <div class="kpi-value" data-money="${k.profitPeriodUsd || 0}">${WorkerFormat.money(k.profitPeriodUsd || 0)}</div>
              ${WorkerFormat.kpiDeltaHtml(k.profitPeriodDeltaPct)}
            </div>
            ${renderSparkline(sparkProfit, "period")}
          </div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-cell-top">
            <span class="kpi-icon kpi-icon-logs" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M7 3.5h6.2L17.5 8v11.5A1.5 1.5 0 0 1 16 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13.2 3.5V8H17.5M9 12h6M9 15.2h6M9 18.4h3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="kpi-label">${WorkerI18n.t("dashboard.logs")} <span class="kpi-hint">${WorkerI18n.t("dashboard.logsHint")}</span></div>
          </div>
          <div class="kpi-cell-main">
            <div class="kpi-cell-nums">
              <div class="kpi-value">${k.logsPeriod ?? 0} <span class="muted">/ ${k.totalLogs || 0}</span></div>
              ${WorkerFormat.kpiDeltaHtml(k.logsDeltaPct)}
            </div>
            ${renderSparkline(sparkLogs, "logs")}
          </div>
        </div>
        <div class="kpi-cell">
          <div class="kpi-cell-top">
            <span class="kpi-icon kpi-icon-mafile" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M8 4.5h5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V6A1.5 1.5 0 0 1 8 4.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 4.5V9h4.5M9.5 13.5h5M9.5 16.5h3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
            <div class="kpi-label">${WorkerI18n.t("dashboard.mafile")} <span class="kpi-hint">${WorkerI18n.t("dashboard.mafileHint")}</span></div>
          </div>
          <div class="kpi-cell-main">
            <div class="kpi-cell-nums">
              <div class="kpi-value">${k.mafilePeriod ?? 0} <span class="muted">/ ${k.mafileTotal || 0}</span></div>
              ${WorkerFormat.kpiDeltaHtml(k.mafileDeltaPct)}
            </div>
            ${renderSparkline(sparkMafile, "mafile")}
          </div>
        </div>
      </div>
    </section>

    <section class="section section-dynamics">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("dashboard.chartTitle")}</h2>
        <div class="chart-legend">
          <button type="button" class="chart-legend-item" id="legendProfit">
            <span class="chart-legend-dot chart-legend-dot-profit"></span>
            ${WorkerI18n.t("dashboard.chartLegendProfit")}
          </button>
          <button type="button" class="chart-legend-item" id="legendLogs">
            <span class="chart-legend-dot chart-legend-dot-logs"></span>
            ${WorkerI18n.t("dashboard.chartLegendLogs")}
          </button>
          <button type="button" class="chart-legend-item" id="legendMafile">
            <span class="chart-legend-dot chart-legend-dot-mafile"></span>
            ${WorkerI18n.t("dashboard.chartLegendMafile")}
          </button>
        </div>
      </div>
      <div id="dashboardChart" class="chart-area"></div>
    </section>

    <section class="section section-events">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("dashboard.recentEvents")}</h2>
        <div id="eventsSortSelect" class="custom-select-host events-sort-host"></div>
      </div>
      ${logsError}
      <div id="eventsTableWrap">${renderEventsFeed(events, WorkerViews.eventsFilters)}</div>
    </section>
  `;

  WorkerDropdown.mount(document.getElementById("periodSelect"), {
    value: String(days),
    ariaLabel: WorkerI18n.t("dashboard.periodLabel"),
    options: [
      { value: "7", label: WorkerI18n.t("dashboard.period7") },
      { value: "14", label: WorkerI18n.t("dashboard.period14") },
      { value: "30", label: WorkerI18n.t("dashboard.period30") },
    ],
    onChange: (value) => {
      WorkerViews.dashboardPeriodDays = Number(value) || 7;
      WorkerViews.dashboard({ main, user, refresh: true });
    },
  });

  mountEventsSortSelect();
  bindEventsFeedRows();

  WorkerCharts.renderDynamicsChart(
    document.getElementById("dashboardChart"),
    (data.series || []).map((row) => ({
      date: row.date,
      label: WorkerFormat.chartDayLabel(row.date),
      profitUsd: row.profitUsd || 0,
      logsCount: row.logsCount || 0,
      mafileCount: row.mafileCount || 0,
      profitDisplay: WorkerFormat.money(row.profitUsd || 0),
    })),
    {
      empty: WorkerI18n.t("dashboard.chartEmpty"),
      profitLabel: WorkerI18n.t("dashboard.chartLegendProfit"),
      logsLabel: WorkerI18n.t("dashboard.chartLegendLogs"),
      mafileLabel: WorkerI18n.t("dashboard.chartLegendMafile"),
      formatAmountTick: (v) => WorkerFormat.moneyTick(v),
      legendProfitEl: document.getElementById("legendProfit"),
      legendLogsEl: document.getElementById("legendLogs"),
      legendMafileEl: document.getElementById("legendMafile"),
    }
  );
};

function renderSparkline(values, tone = "profit") {
  const nums = (values || []).map((v) => Math.max(0, Number(v) || 0));
  const w = 100;
  const h = 24;
  const data = nums.length >= 2 ? nums : [0, 0];
  const max = Math.max(...data, 1);
  const step = w / (data.length - 1);
  const pts = data
    .map((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return `
    <div class="kpi-spark kpi-spark-${tone}${nums.every((v) => v <= 0) ? " is-empty" : ""}" aria-hidden="true">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" focusable="false">
        <polyline points="${pts}"></polyline>
      </svg>
    </div>
  `;
}

function buildRecentEvents(logs, mafiles) {
  const tagged = [
    ...(logs || []).map((row) => ({ ...row, eventType: "log" })),
    ...(mafiles || []).map((row) => ({ ...row, eventType: "mafile" })),
  ];
  return tagged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

function normalizeEventStatus(status) {
  const raw = String(status || "");
  if (/mafile/i.test(raw)) return "mafile";
  if (/валид|valid|ok/i.test(raw)) return "valid";
  if (/невалид|invalid/i.test(raw)) return "invalid";
  return "other";
}

function applyEventsSort(rows, filters) {
  const dir = filters.dir === "asc" ? 1 : -1;
  return [...rows]
    .sort((a, b) => compareEvents(a, b, filters.sort) * dir)
    .slice(0, 12);
}

function compareEvents(a, b, sortKey) {
  switch (sortKey) {
    case "id":
      return String(a.id || "").localeCompare(String(b.id || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    case "type":
      return String(a.eventType || "").localeCompare(String(b.eventType || ""));
    case "account": {
      const av = eventAccountLabel(a);
      const bv = eventAccountLabel(b);
      return av.localeCompare(bv);
    }
    case "price":
      return Number(a.priceUsd || 0) - Number(b.priceUsd || 0);
    case "status":
      return normalizeEventStatus(a.status).localeCompare(normalizeEventStatus(b.status));
    case "date":
    default:
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  }
}

function eventAccountLabel(row) {
  const parts = [row.username, row.country, row.level != null ? `${row.level} LVL` : ""]
    .filter(Boolean);
  return parts.join(" · ");
}

function eventsSortValue(filters) {
  return `${filters.sort}:${filters.dir}`;
}

function mountEventsSortSelect() {
  const host = document.getElementById("eventsSortSelect");
  if (!host || !window.WorkerDropdown) return;
  const filters = WorkerViews.eventsFilters;
  WorkerDropdown.mount(host, {
    value: eventsSortValue(filters),
    ariaLabel: WorkerI18n.t("dashboard.eventsSort") || "Сортировка",
    options: [
      { value: "date:desc", label: WorkerI18n.t("dashboard.sortDateDesc") || "Сначала новые" },
      { value: "date:asc", label: WorkerI18n.t("dashboard.sortDateAsc") || "Сначала старые" },
      { value: "price:desc", label: WorkerI18n.t("dashboard.sortPriceDesc") || "Цена ↓" },
      { value: "price:asc", label: WorkerI18n.t("dashboard.sortPriceAsc") || "Цена ↑" },
      { value: "status:asc", label: WorkerI18n.t("dashboard.sortStatus") || "По статусу" },
    ],
    onChange: (value) => {
      const [sort, dir] = String(value || "date:desc").split(":");
      WorkerViews.eventsFilters.sort = sort || "date";
      WorkerViews.eventsFilters.dir = dir === "asc" ? "asc" : "desc";
      refreshEventsTable();
    },
  });
}

function renderEventsFeed(rows, filters = WorkerViews.eventsFilters) {
  if (!rows.length) {
    return `<div class="events-empty">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.noEvents"))}</div>`;
  }

  return `
    <div class="events-feed" id="eventsTable">
      ${rows
        .map((row) => {
          const badgeClass = WorkerFormat.statusBadgeClass(row.status);
          const status = WorkerFormat.statusLabel(row.status);
          const typeLabel =
            row.eventType === "mafile"
              ? WorkerI18n.t("table.typeMafile")
              : WorkerI18n.t("table.typeLog");
          const account = eventAccountLabel(row);
          const typeClass = row.eventType === "mafile" ? "is-mafile" : "is-log";

          return `
            <button type="button" class="event-row ${typeClass}" data-event-id="${WorkerFormat.escapeHtml(
              String(row.id || "")
            )}">
              <span class="event-row-accent" aria-hidden="true"></span>
              <span class="event-row-body">
                <span class="event-row-top">
                  <span class="badge type">${WorkerFormat.escapeHtml(typeLabel)}</span>
                  <span class="event-row-account">${WorkerFormat.escapeHtml(account || "—")}</span>
                  <span class="event-row-price">${WorkerFormat.escapeHtml(
                    WorkerFormat.money(row.priceUsd || 0)
                  )}</span>
                </span>
                <span class="event-row-meta">
                  <span>${WorkerFormat.escapeHtml(WorkerFormat.date(row.createdAt))}</span>
                  <span class="event-row-id">#${WorkerFormat.escapeHtml(String(row.id || ""))}</span>
                  <span class="badge ${badgeClass}">${WorkerFormat.escapeHtml(status)}</span>
                </span>
              </span>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderEventsTable(rows, filters = WorkerViews.eventsFilters) {
  return renderEventsFeed(rows, filters);
}

function refreshEventsTable() {
  const wrap = document.getElementById("eventsTableWrap");
  if (!wrap) return;
  const sorted = applyEventsSort(WorkerViews.eventsCache, WorkerViews.eventsFilters);
  wrap.innerHTML = renderEventsFeed(sorted, WorkerViews.eventsFilters);
  bindEventsFeedRows();
}

function findEventById(id) {
  const key = String(id || "");
  return WorkerViews.eventsCache.find((row) => String(row.id || "") === key) || null;
}

function canSellEvent(row) {
  if (!row || row.eventType !== "log") return false;
  const status = normalizeEventStatus(row.status);
  const saleStatus = String(row.saleStatus || "none");
  return status === "valid" && !["pending", "done"].includes(saleStatus);
}

function canProcessEvent(row) {
  if (!row || row.eventType !== "mafile") return false;
  const status = normalizeEventStatus(row.status);
  const processStatus = String(row.processStatus || "none");
  return status === "mafile" && !["pending", "done"].includes(processStatus);
}

function requestStatusLabel(kind, status) {
  const value = String(status || "none");
  if (value === "pending") {
    return kind === "sell"
      ? WorkerI18n.t("dashboard.salePending") || "Заявка на продажу отправлена"
      : WorkerI18n.t("dashboard.processPending") || "Заявка на отработку отправлена";
  }
  if (value === "done") {
    return kind === "sell"
      ? WorkerI18n.t("dashboard.saleDone") || "Продано"
      : WorkerI18n.t("dashboard.processDone") || "Отработано";
  }
  return "";
}

function ensureEventCardDialog() {
  let dialog = document.getElementById("eventCardDialog");
  if (dialog && !dialog.querySelector("#eventCardGames")) {
    dialog.remove();
    dialog = null;
  }
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "eventCardDialog";
  dialog.className = "sites-dialog event-card-dialog";
  dialog.innerHTML = `
    <div class="sites-dialog-body event-card-body">
      <div class="event-card-head">
        <div class="event-card-head-text">
          <h3 class="sites-dialog-title" id="eventCardTitle"></h3>
          <p class="muted sites-dialog-sub" id="eventCardSubtitle"></p>
        </div>
        <span class="badge" id="eventCardStatusBadge"></span>
      </div>

      <div class="event-money-grid" id="eventCardMoney"></div>
      <dl class="event-detail-grid" id="eventCardDetails"></dl>

      <div class="event-block" id="eventCardGames" hidden></div>
      <div class="event-block" id="eventCardItems" hidden></div>

      <div class="inline-alert" id="eventCardError" style="display:none;"></div>
      <div class="kpi-hint" id="eventCardHint"></div>

      <div class="event-card-tools" id="eventCardTools">
        <button type="button" class="btn btn-ghost event-tool-btn" id="eventCardRefresh"></button>
        <button type="button" class="btn btn-ghost event-tool-btn" id="eventCardCheckValid"></button>
        <a class="btn btn-ghost event-tool-btn" id="eventCardSteam" hidden target="_blank" rel="noopener noreferrer"></a>
      </div>

      <div class="event-card-footer">
        <button type="button" class="btn btn-ghost" id="eventCardClose"></button>
        <button type="button" class="btn btn-primary" id="eventCardAction" hidden></button>
      </div>
    </div>
  `;
  document.body.appendChild(dialog);

  dialog.querySelector("#eventCardClose")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  return dialog;
}

function renderEventDetailItem(label, value) {
  return `
    <div class="event-detail-item">
      <dt>${WorkerFormat.escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderEventMoney(detail) {
  return `
    <div class="event-money-card">
      <div class="event-money-label">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.balance") || "Баланс")}</div>
      <div class="event-money-value">${WorkerFormat.escapeHtml(WorkerFormat.money(detail.balanceUsd || 0))}</div>
    </div>
    <div class="event-money-card">
      <div class="event-money-label">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.inventory") || "Инвентарь")}</div>
      <div class="event-money-value">${WorkerFormat.escapeHtml(WorkerFormat.money(detail.inventoryUsd || 0))}</div>
    </div>
    <div class="event-money-card is-total">
      <div class="event-money-label">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.totalValue") || "Итого")}</div>
      <div class="event-money-value">${WorkerFormat.escapeHtml(WorkerFormat.money(detail.priceUsd || 0))}</div>
    </div>
  `;
}

function renderEventGames(games) {
  const rows = Array.isArray(games) ? games.filter(Boolean) : [];
  if (!rows.length) return "";
  return `
    <div class="event-block-title">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.gamesTitle") || "Игры")}</div>
    <div class="event-games-list">
      ${rows
        .map((game) => {
          const icon = game.iconUrl
            ? `<img class="event-game-icon" src="${WorkerFormat.escapeHtml(game.iconUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
            : `<span class="event-game-icon is-fallback" aria-hidden="true"></span>`;
          const hours =
            Number(game.playtime) > 0
              ? `<span class="event-game-meta">${Math.round(Number(game.playtime) / 60)} ч</span>`
              : "";
          return `
            <div class="event-game-chip" title="${WorkerFormat.escapeHtml(game.name || "")}">
              ${icon}
              <span class="event-game-name">${WorkerFormat.escapeHtml(game.name || "Game")}</span>
              ${hours}
            </div>`;
        })
        .join("")}
    </div>
  `;
}

function renderEventItems(items) {
  const rows = (items || []).filter((item) => Number(item.priceUsd || 0) > 1);
  if (!rows.length) return "";
  return `
    <div class="event-block-title">${WorkerFormat.escapeHtml(
      WorkerI18n.t("dashboard.topItems") || "Инвентарь"
    )}</div>
    <div class="event-items-list">
      ${rows
        .map((item) => {
          const icon = item.iconUrl
            ? `<img class="event-item-icon" src="${WorkerFormat.escapeHtml(item.iconUrl)}" alt="" loading="lazy" onerror="this.remove()" />`
            : `<span class="event-item-icon is-fallback" aria-hidden="true"></span>`;
          return `
        <div class="event-item-row">
          ${icon}
          <span class="event-item-name">${WorkerFormat.escapeHtml(item.name || "Item")}</span>
          <span class="event-item-price">${WorkerFormat.escapeHtml(WorkerFormat.money(item.priceUsd || 0))}</span>
        </div>`;
        })
        .join("")}
    </div>
  `;
}

function mergeEventCache(detail) {
  if (!detail?.id) return detail;
  const cached = findEventById(detail.id);
  if (cached) {
    Object.assign(cached, {
      username: detail.username || cached.username,
      status: detail.status || cached.status,
      steamId: detail.steamId || cached.steamId,
      priceUsd: detail.priceUsd ?? cached.priceUsd,
      balanceUsd: detail.balanceUsd,
      inventoryUsd: detail.inventoryUsd,
      saleStatus: detail.saleStatus || cached.saleStatus,
      processStatus: detail.processStatus || cached.processStatus,
      eventType: detail.eventType || cached.eventType,
      gamesCount: detail.gamesCount ?? cached.gamesCount,
      games: detail.games || cached.games,
      topItems: detail.topItems || cached.topItems,
      inventoryBreakdown: detail.inventoryBreakdown || cached.inventoryBreakdown,
      steamProfileUrl: detail.steamProfileUrl || cached.steamProfileUrl,
      level: detail.level ?? cached.level,
      country: detail.country || cached.country,
    });
    return cached;
  }
  WorkerViews.eventsCache.unshift(detail);
  return detail;
}

async function openEventCard(row) {
  if (!row) return;
  const dialog = ensureEventCardDialog();
  dialog.dataset.eventId = String(row.id || "");

  // Optimistic render from list row, then enrich from API.
  fillEventCard(row, { loading: true });
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "open");

  try {
    const detail = await WorkerAPI.get(`/logs/${encodeURIComponent(String(row.id))}`, {
      force: true,
    });
    const merged = mergeEventCache({ ...row, ...detail });
    fillEventCard(merged, { loading: false });
    refreshEventsTable();
  } catch (error) {
    fillEventCard(row, { loading: false });
    if (window.WorkerToast) WorkerToast.error(error);
  }
}

function fillEventCard(row, { loading = false, error = "" } = {}) {
  const dialog = ensureEventCardDialog();
  const typeLabel =
    row.eventType === "mafile"
      ? WorkerI18n.t("table.typeMafile")
      : WorkerI18n.t("table.typeLog");
  const badgeClass = WorkerFormat.statusBadgeClass(row.status);
  const status = WorkerFormat.statusLabel(row.status);
  const account = eventAccountLabel(row);
  const canSell = canSellEvent(row);
  const canProcess = canProcessEvent(row);
  const saleStatus = String(row.saleStatus || "none");
  const processStatus = String(row.processStatus || "none");

  document.getElementById("eventCardTitle").textContent = WorkerI18n.t("dashboard.eventCardTitle", {
    type: typeLabel,
    id: String(row.id || ""),
  });
  document.getElementById("eventCardSubtitle").textContent = loading
    ? WorkerI18n.t("common.loading")
    : WorkerFormat.date(row.createdAt);

  const statusBadge = document.getElementById("eventCardStatusBadge");
  statusBadge.className = `badge ${badgeClass}`;
  statusBadge.textContent = status;

  document.getElementById("eventCardMoney").innerHTML = renderEventMoney(row);

  document.getElementById("eventCardDetails").innerHTML = [
    renderEventDetailItem(WorkerI18n.t("table.id"), WorkerFormat.escapeHtml(String(row.id || "—"))),
    renderEventDetailItem(
      WorkerI18n.t("table.type"),
      `<span class="badge type">${WorkerFormat.escapeHtml(typeLabel)}</span>`
    ),
    renderEventDetailItem(
      WorkerI18n.t("table.account"),
      WorkerFormat.escapeHtml(account || "—")
    ),
    row.steamId
      ? renderEventDetailItem("Steam ID", `<code>${WorkerFormat.escapeHtml(String(row.steamId))}</code>`)
      : "",
    row.level != null
      ? renderEventDetailItem("LVL", WorkerFormat.escapeHtml(String(row.level)))
      : "",
    row.country
      ? renderEventDetailItem(
          WorkerI18n.t("dashboard.country") || "Страна",
          WorkerFormat.escapeHtml(String(row.country))
        )
      : "",
  ]
    .filter(Boolean)
    .join("");

  const gamesEl = document.getElementById("eventCardGames");
  const gamesHtml = renderEventGames(row.games || []);
  gamesEl.hidden = !gamesHtml;
  gamesEl.innerHTML = gamesHtml;

  const itemsEl = document.getElementById("eventCardItems");
  const itemsHtml = renderEventItems(row.topItems || []);
  itemsEl.hidden = !itemsHtml;
  itemsEl.innerHTML = itemsHtml;

  const errorEl = document.getElementById("eventCardError");
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  const hintEl = document.getElementById("eventCardHint");
  const hint =
    requestStatusLabel("sell", saleStatus) || requestStatusLabel("process", processStatus);
  hintEl.textContent = hint;

  document.getElementById("eventCardClose").textContent =
    WorkerI18n.t("dashboard.eventCardClose") || "Закрыть";

  const refreshBtn = document.getElementById("eventCardRefresh");
  refreshBtn.disabled = loading;
  refreshBtn.textContent = WorkerI18n.t("dashboard.actionRefresh") || "Обновить";
  refreshBtn.onclick = () => runEventCardRefresh(row);

  const checkBtn = document.getElementById("eventCardCheckValid");
  checkBtn.disabled = loading;
  checkBtn.textContent = WorkerI18n.t("dashboard.actionCheckValid") || "Проверить на валид";
  checkBtn.onclick = () => runEventCardCheckValid(row);

  const steamLink = document.getElementById("eventCardSteam");
  if (row.steamProfileUrl || row.steamId) {
    steamLink.hidden = false;
    steamLink.href =
      row.steamProfileUrl || `https://steamcommunity.com/profiles/${row.steamId}`;
    steamLink.textContent = WorkerI18n.t("dashboard.actionSteam") || "Steam профиль";
  } else {
    steamLink.hidden = true;
  }

  const actionBtn = document.getElementById("eventCardAction");
  actionBtn.hidden = true;
  actionBtn.disabled = loading;
  actionBtn.onclick = null;

  if (canSell) {
    actionBtn.hidden = false;
    actionBtn.textContent = WorkerI18n.t("dashboard.actionSell") || "Продать";
    actionBtn.onclick = () => runEventCardAction(row, "sell");
  } else if (canProcess) {
    actionBtn.hidden = false;
    actionBtn.textContent = WorkerI18n.t("dashboard.actionProcess") || "Отправить на отработку";
    actionBtn.onclick = () => runEventCardAction(row, "process");
  }
}

async function runEventCardRefresh(row) {
  const refreshBtn = document.getElementById("eventCardRefresh");
  refreshBtn.disabled = true;
  try {
    const detail = await WorkerAPI.post(`/logs/${encodeURIComponent(String(row.id))}/refresh`);
    const merged = mergeEventCache({ ...row, ...detail });
    fillEventCard(merged);
    refreshEventsTable();
    if (window.WorkerToast) {
      WorkerToast.success(WorkerI18n.t("toast.refreshed") || "Данные обновлены");
    }
  } catch (error) {
    if (window.WorkerToast) WorkerToast.error(error);
    refreshBtn.disabled = false;
  }
}

async function runEventCardCheckValid(row) {
  const hintEl = document.getElementById("eventCardHint");
  const checkBtn = document.getElementById("eventCardCheckValid");
  checkBtn.disabled = true;
  try {
    const result = await WorkerAPI.post(
      `/logs/${encodeURIComponent(String(row.id))}/check-valid`
    );
    hintEl.textContent =
      WorkerI18n.t("dashboard.checkValidStarted", {
        id: result.taskId || "—",
      }) || `Проверка запущена${result.taskId ? ` · задача #${result.taskId}` : ""}`;
    if (window.WorkerToast) {
      WorkerToast.success(WorkerI18n.t("toast.checkValid") || "Проверка на валид запущена");
    }
    setTimeout(async () => {
      try {
        const detail = await WorkerAPI.post(
          `/logs/${encodeURIComponent(String(row.id))}/refresh`
        );
        fillEventCard(mergeEventCache({ ...row, ...detail }));
        refreshEventsTable();
      } catch (_) {
        checkBtn.disabled = false;
      }
    }, 2500);
  } catch (error) {
    if (window.WorkerToast) WorkerToast.error(error);
    checkBtn.disabled = false;
  }
}

async function runEventCardAction(row, action) {
  const actionBtn = document.getElementById("eventCardAction");
  const sourceId = encodeURIComponent(String(row.id || ""));

  actionBtn.disabled = true;

  try {
    const result =
      action === "sell"
        ? await WorkerAPI.post(`/logs/${sourceId}/sell`)
        : await WorkerAPI.post(`/logs/${sourceId}/process`);

    const cached = findEventById(row.id);
    if (cached) {
      if (action === "sell") cached.saleStatus = result.saleStatus || "pending";
      else cached.processStatus = result.processStatus || "pending";
    }

    fillEventCard(findEventById(row.id) || row);
    refreshEventsTable();
    if (window.WorkerToast) {
      WorkerToast.success(
        action === "sell"
          ? WorkerI18n.t("toast.sellSent") || "Заявка на продажу отправлена"
          : WorkerI18n.t("toast.processSent") || "Заявка на отработку отправлена"
      );
    }
  } catch (error) {
    if (window.WorkerToast) WorkerToast.error(error);
    actionBtn.disabled = false;
  }
}

function bindEventsFeedRows() {
  document.querySelectorAll("#eventsTable .event-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = findEventById(btn.dataset.eventId);
      if (row) openEventCard(row);
    });
  });
}

function bindEventsTableRows() {
  bindEventsFeedRows();
}

function bindEventsTableSort() {
  /* sorting moved to dropdown */
}

WorkerViews.dashboard.refreshMoney = function refreshDashboardMoney() {
  document.querySelectorAll("[data-money]").forEach((el) => {
    el.textContent = WorkerFormat.money(el.dataset.money);
  });
  refreshEventsTable();
};

WorkerViews.openEventCard = openEventCard;
