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

  WorkerAPI.bust("/overview");
  const data = await WorkerAPI.get(`/overview?days=${days}`, { force: true });
  const k = data.kpi || {};
  const u = data.user || {};
  const name = WorkerFormat.escapeHtml(user.firstName || user.username || user.telegramId);

  const logsError = data.logsError
    ? `<div class="inline-alert">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.logsError"))}</div>`
    : "";

  WorkerViews.eventsCache = buildRecentEvents(data.recentLogs || [], data.recentMafiles || []);
  const events = applyEventsSort(WorkerViews.eventsCache, WorkerViews.eventsFilters);

  main.innerHTML = `
    <h1 class="page-greeting">${WorkerI18n.t("dashboard.greeting")} <em>${name}</em></h1>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("dashboard.statsTitle")}</h2>
        <div id="periodSelect" class="custom-select-host"></div>
      </div>
      <div class="kpi-grid">
        <div class="kpi-cell">
          <div class="kpi-label">${WorkerI18n.t("dashboard.profitTotal")}</div>
          <div class="kpi-value" data-money="${u.profitTotalUsd ?? u.walletUsd ?? 0}">${WorkerFormat.money(u.profitTotalUsd ?? u.walletUsd ?? 0)}</div>
          ${WorkerFormat.kpiDeltaHtml(k.profitTotalDeltaPct)}
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">${WorkerI18n.t("dashboard.profitPeriod")}</div>
          <div class="kpi-value" data-money="${k.profitPeriodUsd || 0}">${WorkerFormat.money(k.profitPeriodUsd || 0)}</div>
          ${WorkerFormat.kpiDeltaHtml(k.profitPeriodDeltaPct)}
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">${WorkerI18n.t("dashboard.logs")} <span class="kpi-hint">${WorkerI18n.t("dashboard.logsHint")}</span></div>
          <div class="kpi-value">${k.logsPeriod ?? 0} <span class="muted">/ ${k.totalLogs || 0}</span></div>
          ${WorkerFormat.kpiDeltaHtml(k.logsDeltaPct)}
        </div>
        <div class="kpi-cell">
          <div class="kpi-label">${WorkerI18n.t("dashboard.mafile")} <span class="kpi-hint">${WorkerI18n.t("dashboard.mafileHint")}</span></div>
          <div class="kpi-value">${k.mafilePeriod ?? 0} <span class="muted">/ ${k.mafileTotal || 0}</span></div>
          ${WorkerFormat.kpiDeltaHtml(k.mafileDeltaPct)}
        </div>
      </div>
    </section>

    <section class="section">
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

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("dashboard.recentEvents")}</h2>
      </div>
      ${logsError}
      <div id="eventsTableWrap">${renderEventsTable(events, WorkerViews.eventsFilters)}</div>
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

  bindEventsTableSort();
  bindEventsTableRows();

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

function sortIcon(col, filters) {
  if (filters.sort !== col) return "↕";
  return filters.dir === "asc" ? "↑" : "↓";
}

function renderEventsTable(rows, filters = WorkerViews.eventsFilters) {
  const th = (col, label, extraClass = "") => {
    const sorted = filters.sort === col ? " is-sorted" : "";
    return `<th class="sortable${sorted}${extraClass ? ` ${extraClass}` : ""}" data-sort="${col}">
      <span class="th-sort">${WorkerFormat.escapeHtml(label)}<span class="th-sort-icon">${sortIcon(col, filters)}</span></span>
    </th>`;
  };

  const body = rows.length
    ? rows
        .map((row) => {
          const badgeClass = WorkerFormat.statusBadgeClass(row.status);
          const status = WorkerFormat.statusLabel(row.status);
          const typeLabel =
            row.eventType === "mafile"
              ? WorkerI18n.t("table.typeMafile")
              : WorkerI18n.t("table.typeLog");
          const account = eventAccountLabel(row);

          return `<tr class="is-clickable" data-event-id="${WorkerFormat.escapeHtml(String(row.id || ""))}" tabindex="0" role="button">
        <td>${WorkerFormat.escapeHtml(row.id)}</td>
        <td class="muted">${WorkerFormat.escapeHtml(WorkerFormat.date(row.createdAt))}</td>
        <td><span class="badge type">${WorkerFormat.escapeHtml(typeLabel)}</span></td>
        <td>${WorkerFormat.escapeHtml(account || "—")}</td>
        <td class="td-num">${WorkerFormat.escapeHtml(WorkerFormat.money(row.priceUsd || 0))}</td>
        <td><span class="badge ${badgeClass}">${WorkerFormat.escapeHtml(status)}</span></td>
      </tr>`;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="6">${WorkerFormat.escapeHtml(WorkerI18n.t("dashboard.noEvents"))}</td></tr>`;

  return `
    <div class="table-wrap">
      <table class="data" id="eventsTable">
        <thead>
          <tr>
            ${th("id", WorkerI18n.t("table.id"))}
            ${th("date", WorkerI18n.t("table.date"))}
            ${th("type", WorkerI18n.t("table.type"))}
            ${th("account", WorkerI18n.t("table.account"))}
            ${th("price", WorkerI18n.t("table.price"), "col-num")}
            ${th("status", WorkerI18n.t("table.status"))}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function refreshEventsTable() {
  const wrap = document.getElementById("eventsTableWrap");
  if (!wrap) return;
  const sorted = applyEventsSort(WorkerViews.eventsCache, WorkerViews.eventsFilters);
  wrap.innerHTML = renderEventsTable(sorted, WorkerViews.eventsFilters);
  bindEventsTableSort();
  bindEventsTableRows();
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
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "eventCardDialog";
  dialog.className = "sites-dialog sites-dialog-wide";
  dialog.innerHTML = `
    <div class="sites-dialog-body event-card-body">
      <h3 class="sites-dialog-title" id="eventCardTitle"></h3>
      <p class="muted sites-dialog-sub" id="eventCardSubtitle"></p>
      <dl class="event-detail-grid" id="eventCardDetails"></dl>
      <div class="inline-alert" id="eventCardError" style="display:none;"></div>
      <div class="kpi-hint" id="eventCardHint"></div>
      <div class="sites-dialog-actions">
        <button type="button" class="btn btn-ghost" id="eventCardClose">${WorkerFormat.escapeHtml(
          WorkerI18n.t("dashboard.eventCardClose") || "Закрыть"
        )}</button>
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

function openEventCard(row) {
  if (!row) return;
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

  dialog.dataset.eventId = String(row.id || "");

  document.getElementById("eventCardTitle").textContent = WorkerI18n.t("dashboard.eventCardTitle", {
    type: typeLabel,
    id: String(row.id || ""),
  });
  document.getElementById("eventCardSubtitle").textContent = WorkerFormat.date(row.createdAt);

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
    renderEventDetailItem(
      WorkerI18n.t("table.price"),
      WorkerFormat.escapeHtml(WorkerFormat.money(row.priceUsd || 0))
    ),
    renderEventDetailItem(
      WorkerI18n.t("table.status"),
      `<span class="badge ${badgeClass}">${WorkerFormat.escapeHtml(status)}</span>`
    ),
    row.steamId
      ? renderEventDetailItem("Steam ID", WorkerFormat.escapeHtml(String(row.steamId)))
      : "",
    row.gamesCount
      ? renderEventDetailItem(
          WorkerI18n.t("dashboard.gamesCount") || "Игры",
          WorkerFormat.escapeHtml(String(row.gamesCount))
        )
      : "",
  ]
    .filter(Boolean)
    .join("");

  const errorEl = document.getElementById("eventCardError");
  errorEl.style.display = "none";
  errorEl.textContent = "";

  const hintEl = document.getElementById("eventCardHint");
  const hint =
    requestStatusLabel("sell", saleStatus) || requestStatusLabel("process", processStatus);
  hintEl.textContent = hint;

  const actionBtn = document.getElementById("eventCardAction");
  actionBtn.hidden = true;
  actionBtn.disabled = false;
  actionBtn.dataset.action = "";
  actionBtn.replaceWith(actionBtn.cloneNode(true));
  const freshActionBtn = document.getElementById("eventCardAction");

  if (canSell) {
    freshActionBtn.hidden = false;
    freshActionBtn.textContent = WorkerI18n.t("dashboard.actionSell") || "Продать";
    freshActionBtn.dataset.action = "sell";
    freshActionBtn.addEventListener("click", () => runEventCardAction(row, "sell"));
  } else if (canProcess) {
    freshActionBtn.hidden = false;
    freshActionBtn.textContent = WorkerI18n.t("dashboard.actionProcess") || "Отправить на отработку";
    freshActionBtn.dataset.action = "process";
    freshActionBtn.addEventListener("click", () => runEventCardAction(row, "process"));
  }

  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "open");
}

async function runEventCardAction(row, action) {
  const dialog = document.getElementById("eventCardDialog");
  const errorEl = document.getElementById("eventCardError");
  const actionBtn = document.getElementById("eventCardAction");
  const sourceId = encodeURIComponent(String(row.id || ""));

  errorEl.style.display = "none";
  errorEl.textContent = "";
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

    openEventCard(findEventById(row.id) || row);
    refreshEventsTable();
  } catch (error) {
    errorEl.textContent = error.message || WorkerI18n.t("common.error") || "Ошибка";
    errorEl.style.display = "block";
    actionBtn.disabled = false;
  }
}

function bindEventsTableRows() {
  document.querySelectorAll("#eventsTable tbody tr.is-clickable").forEach((tr) => {
    tr.addEventListener("click", () => {
      const row = findEventById(tr.dataset.eventId);
      if (row) openEventCard(row);
    });
    tr.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const row = findEventById(tr.dataset.eventId);
      if (row) openEventCard(row);
    });
  });
}

function bindEventsTableSort() {
  document.querySelectorAll("#eventsTable th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.sort;
      if (!col) return;
      if (WorkerViews.eventsFilters.sort === col) {
        WorkerViews.eventsFilters.dir = WorkerViews.eventsFilters.dir === "asc" ? "desc" : "asc";
      } else {
        WorkerViews.eventsFilters.sort = col;
        WorkerViews.eventsFilters.dir = col === "date" ? "desc" : "asc";
      }
      refreshEventsTable();
    });
  });
}

WorkerViews.dashboard.refreshMoney = function refreshDashboardMoney() {
  document.querySelectorAll("[data-money]").forEach((el) => {
    el.textContent = WorkerFormat.money(el.dataset.money);
  });
  refreshEventsTable();
};
