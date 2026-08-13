window.WorkerViews = window.WorkerViews || {};

WorkerViews.topState = { period: "7d" };

function topEmptyIcon(kind) {
  if (kind === "error") {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v5.2M12 15.8h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.5 9.5h9l-.8 9.2a1.6 1.6 0 0 1-1.6 1.5H9.9a1.6 1.6 0 0 1-1.6-1.5L7.5 9.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.2 9.5 10 5.8h4l.8 3.7M6 9.5h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function renderTopEmptyState({ kind = "empty", title, text, actions = [] } = {}) {
  const actionsHtml = actions.length
    ? `<div class="empty-state-actions">${actions.join("")}</div>`
    : "";
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${topEmptyIcon(kind)}</div>
      <h2 class="empty-state-title">${WorkerFormat.escapeHtml(title)}</h2>
      <p class="empty-state-text">${WorkerFormat.escapeHtml(text)}</p>
      ${actionsHtml}
    </div>`;
}

function renderTopRows(rows) {
  return `
    <div class="top-list">
      ${rows
        .map((row) => {
          const medal =
            row.rank === 1 ? "gold" : row.rank === 2 ? "silver" : row.rank === 3 ? "bronze" : "";
          const name = row.displayName || "—";
          const handle = row.username ? `@${row.username}` : "";
          return `
            <article class="top-row${row.isMe ? " is-me" : ""}${medal ? ` is-${medal}` : ""}">
              <div class="top-rank" aria-hidden="true">${row.rank}</div>
              <div class="top-who">
                <div class="top-name">${WorkerFormat.escapeHtml(name)}${row.isMe ? ` <span class="top-me">${WorkerI18n.t("top.you")}</span>` : ""}</div>
                ${handle ? `<div class="top-handle muted">${WorkerFormat.escapeHtml(handle)}</div>` : ""}
              </div>
              <div class="top-stats">
                <div class="top-amount">${WorkerFormat.escapeHtml(WorkerFormat.money(row.totalUsd || 0))}</div>
                <div class="top-count muted">${WorkerI18n.t("top.profitsCount", { count: row.count || 0 })}</div>
              </div>
            </article>`;
        })
        .join("")}
    </div>
  `;
}

WorkerViews.top = async function renderTop(ctx) {
  const { main, user } = ctx;
  const state = WorkerViews.topState;

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-greeting">${WorkerI18n.t("top.pageTitle")}</h1>
        <p class="page-sub muted">${WorkerI18n.t("top.subtitle")}</p>
      </div>
      <div id="topPeriodSelect" class="custom-select-host"></div>
    </div>
    <div id="topBody">
      <div class="panel-empty">${WorkerFormat.escapeHtml(WorkerI18n.t("common.loading"))}</div>
    </div>
  `;

  async function load({ force = false } = {}) {
    const body = document.getElementById("topBody");
    try {
      const data = await WorkerAPI.get(`/top?period=${encodeURIComponent(state.period)}&limit=15`, {
        force,
      });
      if (!body) return;
      const rows = data.rows || [];
      if (!rows.length) {
        body.className = "";
        body.innerHTML = renderTopEmptyState({
          kind: "empty",
          title: WorkerI18n.t("top.emptyTitle"),
          text: WorkerI18n.t("top.emptyText"),
        });
        return;
      }
      body.className = "section section-flush";
      body.innerHTML = renderTopRows(rows);
      const meRow = rows.find((r) => r.isMe);
      if (!meRow && user?.telegramId) {
        const note = document.createElement("p");
        note.className = "top-note muted";
        note.textContent = WorkerI18n.t("top.notInList");
        body.appendChild(note);
      }
    } catch (error) {
      if (window.WorkerToast) WorkerToast.error(error);
      if (!body) return;
      const message =
        (window.WorkerToast && WorkerToast.friendlyError(error)) ||
        error.message ||
        WorkerI18n.t("common.error");
      body.className = "";
      body.innerHTML = renderTopEmptyState({
        kind: "error",
        title: WorkerI18n.t("top.errorTitle"),
        text: message,
        actions: [
          `<button type="button" class="btn btn-ghost" id="topRetryBtn">${WorkerFormat.escapeHtml(
            WorkerI18n.t("common.retry")
          )}</button>`,
          `<button type="button" class="btn btn-primary" id="topHomeBtn">${WorkerFormat.escapeHtml(
            WorkerI18n.t("notFound.home")
          )}</button>`,
        ],
      });
      document.getElementById("topRetryBtn")?.addEventListener("click", () => load({ force: true }));
      document.getElementById("topHomeBtn")?.addEventListener("click", () => {
        document.querySelector('.nav-item[data-view="dashboard"]')?.click();
      });
    }
  }

  WorkerDropdown.mount(document.getElementById("topPeriodSelect"), {
    value: state.period,
    ariaLabel: WorkerI18n.t("top.period"),
    options: [
      { value: "24h", label: WorkerI18n.t("top.period24h") },
      { value: "7d", label: WorkerI18n.t("top.period7d") },
      { value: "30d", label: WorkerI18n.t("top.period30d") },
      { value: "all", label: WorkerI18n.t("top.periodAll") },
    ],
    onChange: (value) => {
      state.period = value;
      load({ force: true });
    },
  });

  await load({ force: !!ctx.refresh });
};
