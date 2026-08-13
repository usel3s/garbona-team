window.WorkerViews = window.WorkerViews || {};

WorkerViews.analyticsState = { q: "" };

function linkLabel(link, domainName) {
  const path = String(link.path || "").replace(/^\/+/, "");
  const host = String(domainName || "").replace(/^https?:\/\//, "");
  if (link.url) return String(link.url).replace(/^https?:\/\//, "");
  return path ? `${host}/${path}` : `${host}/`;
}

function countryFlag(code) {
  const cc = String(code || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🌐";
  return String.fromCodePoint(...[...cc].map((ch) => 127397 + ch.charCodeAt(0)));
}

function deviceIcon(name) {
  const n = String(name || "").toLowerCase();
  if (/iphone|android|mobile|phone|ios/.test(n)) {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7.5" y="3.5" width="9" height="17" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M11 17.5h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  if (/ipad|tablet/.test(n)) {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="3.5" width="15" height="17" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M11 17.5h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  if (/mac|windows|linux|desktop|pc|chromeos/.test(n)) {
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="11.5" rx="1.8" stroke="currentColor" stroke-width="1.5"/><path d="M8.5 19.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.5"/><path d="M4.5 12h15M12 4.5c2.4 2.6 2.4 12.4 0 15M12 4.5c-2.4 2.6-2.4 12.4 0 15" stroke="currentColor" stroke-width="1.3"/></svg>`;
}

function renderEmptyState({ kind = "empty", title, text, actions = [] } = {}) {
  const icon =
    kind === "error"
      ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.5"/><path d="M12 8v5.2M12 15.8h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.5 19.5h15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M7 16.5V11M12 16.5V7.5M17 16.5v-3.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  const actionsHtml = actions.length
    ? `<div class="empty-state-actions">${actions.join("")}</div>`
    : "";
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h2 class="empty-state-title">${WorkerFormat.escapeHtml(title)}</h2>
      <p class="empty-state-text">${WorkerFormat.escapeHtml(text)}</p>
      ${actionsHtml}
    </div>`;
}

function renderBreakdownList(items, { kind = "device" } = {}) {
  if (!items?.length) {
    return `<div class="analytics-breakdown-empty">${WorkerFormat.escapeHtml(
      WorkerI18n.t("analytics.noBreakdown")
    )}</div>`;
  }
  const total = items.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  return `
    <ul class="analytics-breakdown-list">
      ${items
        .map((row) => {
          const pct = Math.max(2, Math.round((Number(row.count || 0) / total) * 100));
          const leading =
            kind === "country"
              ? `<span class="analytics-flag" aria-hidden="true">${countryFlag(row.name)}</span>`
              : `<span class="analytics-device-icon" aria-hidden="true">${deviceIcon(row.name)}</span>`;
          return `
            <li class="analytics-breakdown-item">
              <div class="analytics-breakdown-head">
                <span class="analytics-breakdown-label">
                  ${leading}
                  <span>${WorkerFormat.escapeHtml(row.name)}</span>
                </span>
                <span class="analytics-breakdown-count">${Number(row.count || 0)}</span>
              </div>
              <div class="analytics-breakdown-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
            </li>`;
        })
        .join("")}
    </ul>`;
}

function renderLinkRow(row, index) {
  const { link, domain, url } = row;
  if (!link || typeof link !== "object") return "";
  const stats = link.stats || {};
  return `
    <tr class="analytics-row" data-analytics-index="${index}">
      <td>
        <button type="button" class="analytics-link-open" data-analytics-index="${index}">
          <span class="analytics-link-url">${WorkerFormat.escapeHtml(url)}</span>
          <span class="analytics-link-meta muted">
            ${WorkerFormat.escapeHtml(domain.domain)}
            ${link.isPaused ? ` · ${WorkerI18n.t("sites.linkPaused")}` : ""}
          </span>
        </button>
      </td>
      <td class="td-num">${Number(link.online || 0)}</td>
      <td class="td-num">${Number(stats.views || 0)}</td>
      <td class="td-num">${Number(stats.clicks || 0)}</td>
      <td class="td-num">${Number(stats.auths || 0)}</td>
      <td class="td-num">${Number(stats.logs || 0)}</td>
      <td class="td-num">${Number(stats.mafiles || 0)}</td>
    </tr>`;
}

function renderDrawer(row) {
  const { link, domain, url } = row;
  if (!link || typeof link !== "object") return "";
  const stats = link.stats || {};
  const href = `https://${url}`;
  return `
    <div class="analytics-drawer-panel">
      <div class="analytics-drawer-head">
        <div class="analytics-drawer-titles">
          <div class="analytics-drawer-kicker">${WorkerFormat.escapeHtml(domain.domain || "")}</div>
          <h2 class="analytics-drawer-title">${WorkerFormat.escapeHtml(url)}</h2>
        </div>
        <button type="button" class="btn btn-ghost analytics-drawer-close" id="analyticsDrawerClose" aria-label="Close">✕</button>
      </div>

      <div class="analytics-drawer-actions">
        <a class="btn btn-ghost" href="${WorkerFormat.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${WorkerI18n.t("analytics.openLink")}</a>
        ${
          link.isPaused
            ? `<span class="badge warn">${WorkerI18n.t("sites.linkPaused")}</span>`
            : ""
        }
      </div>

      <div class="analytics-drawer-kpis">
        <div class="analytics-drawer-kpi"><span>${WorkerI18n.t("sites.onlineLabel")}</span><strong>${Number(link.online || 0)}</strong></div>
        <div class="analytics-drawer-kpi"><span>${WorkerI18n.t("sites.views")}</span><strong>${Number(stats.views || 0)}</strong></div>
        <div class="analytics-drawer-kpi"><span>${WorkerI18n.t("sites.clicks")}</span><strong>${Number(stats.clicks || 0)}</strong></div>
        <div class="analytics-drawer-kpi"><span>${WorkerI18n.t("sites.auths")}</span><strong>${Number(stats.auths || 0)}</strong></div>
        <div class="analytics-drawer-kpi"><span>${WorkerI18n.t("sites.validLogs")}</span><strong>${Number(stats.logs || 0)}</strong></div>
        <div class="analytics-drawer-kpi"><span>MaFile</span><strong>${Number(stats.mafiles || 0)}</strong></div>
      </div>

      <section class="analytics-drawer-section">
        <h3>${WorkerI18n.t("analytics.devicesTitle")}</h3>
        ${renderBreakdownList(link.devices || [], { kind: "device" })}
      </section>

      ${
        (link.countries || []).length
          ? `<section class="analytics-drawer-section">
        <h3>${WorkerI18n.t("analytics.countriesTitle")}</h3>
        ${renderBreakdownList(link.countries || [], { kind: "country" })}
      </section>`
          : ""
      }

      <section class="analytics-drawer-section analytics-drawer-meta">
        <div><span class="muted">${WorkerI18n.t("analytics.template")}</span><strong>${WorkerFormat.escapeHtml(link.templateName || "—")}</strong></div>
        <div><span class="muted">${WorkerI18n.t("analytics.window")}</span><strong>${WorkerFormat.escapeHtml(link.windowType || "—")}</strong></div>
      </section>
    </div>`;
}

WorkerViews.analytics = async function renderAnalytics(ctx) {
  const { main } = ctx;
  const state = WorkerViews.analyticsState;

  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-greeting">${WorkerI18n.t("analytics.pageTitle")}</h1>
        <p class="page-sub muted">${WorkerI18n.t("analytics.subtitle")}</p>
      </div>
      <div class="page-head-actions" id="analyticsHeadActions" hidden>
        <button type="button" class="btn btn-ghost" id="analyticsRefresh">${WorkerI18n.t("common.refresh")}</button>
      </div>
    </div>

    <div id="analyticsContent">
      <div class="panel-toolbar" id="analyticsToolbar">
        <label class="sites-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input type="search" id="analyticsSearch" value="${WorkerFormat.escapeHtml(state.q)}" placeholder="${WorkerI18n.t("analytics.searchPlaceholder")}" autocomplete="off" />
        </label>
      </div>

      <section class="section section-flush" id="analyticsTableSection">
        <div class="table-wrap analytics-table-wrap">
          <table class="data analytics-table">
            <thead>
              <tr>
                <th>${WorkerI18n.t("analytics.colLink")}</th>
                <th class="col-num">${WorkerI18n.t("sites.onlineLabel")}</th>
                <th class="col-num">${WorkerI18n.t("sites.views")}</th>
                <th class="col-num">${WorkerI18n.t("sites.clicks")}</th>
                <th class="col-num">${WorkerI18n.t("sites.auths")}</th>
                <th class="col-num">${WorkerI18n.t("sites.validLogs")}</th>
                <th class="col-num">MaFile</th>
              </tr>
            </thead>
            <tbody id="analyticsBody">
              <tr><td colspan="7" class="panel-empty">${WorkerFormat.escapeHtml(WorkerI18n.t("common.loading"))}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="analytics-drawer" id="analyticsDrawer" hidden>
      <div class="analytics-drawer-backdrop" id="analyticsDrawerBackdrop"></div>
      <aside class="analytics-drawer-sheet" id="analyticsDrawerSheet" role="dialog" aria-modal="true"></aside>
    </div>
  `;

  let allRows = [];

  function setRefreshVisible(visible) {
    const actions = document.getElementById("analyticsHeadActions");
    if (actions) actions.hidden = !visible;
  }

  function closeDrawer() {
    const drawer = document.getElementById("analyticsDrawer");
    if (!drawer) return;
    drawer.hidden = true;
    drawer.classList.remove("is-open");
  }

  function openDrawer(index) {
    const row = allRows[index];
    const drawer = document.getElementById("analyticsDrawer");
    const sheet = document.getElementById("analyticsDrawerSheet");
    if (!row || !drawer || !sheet) return;
    sheet.innerHTML = renderDrawer(row);
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    document.getElementById("analyticsDrawerClose")?.addEventListener("click", closeDrawer);
  }

  function bindRowClicks() {
    document.querySelectorAll("[data-analytics-index]").forEach((el) => {
      if (el.tagName !== "BUTTON" && !el.classList.contains("analytics-row")) return;
      if (el.tagName === "BUTTON") {
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          openDrawer(Number(el.dataset.analyticsIndex));
        });
      }
    });
  }

  function showGlobalEmpty(html) {
    const content = document.getElementById("analyticsContent");
    if (!content) return;
    content.innerHTML = html;
  }

  function ensureTableShell() {
    const content = document.getElementById("analyticsContent");
    if (!content || document.getElementById("analyticsBody")) return;
    content.innerHTML = `
      <div class="panel-toolbar" id="analyticsToolbar">
        <label class="sites-search">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input type="search" id="analyticsSearch" value="${WorkerFormat.escapeHtml(state.q)}" placeholder="${WorkerI18n.t("analytics.searchPlaceholder")}" autocomplete="off" />
        </label>
      </div>
      <section class="section section-flush" id="analyticsTableSection">
        <div class="table-wrap analytics-table-wrap">
          <table class="data analytics-table">
            <thead>
              <tr>
                <th>${WorkerI18n.t("analytics.colLink")}</th>
                <th class="col-num">${WorkerI18n.t("sites.onlineLabel")}</th>
                <th class="col-num">${WorkerI18n.t("sites.views")}</th>
                <th class="col-num">${WorkerI18n.t("sites.clicks")}</th>
                <th class="col-num">${WorkerI18n.t("sites.auths")}</th>
                <th class="col-num">${WorkerI18n.t("sites.validLogs")}</th>
                <th class="col-num">MaFile</th>
              </tr>
            </thead>
            <tbody id="analyticsBody"></tbody>
          </table>
        </div>
      </section>`;
    document.getElementById("analyticsSearch")?.addEventListener("input", (e) => {
      state.q = e.target.value.trim();
      paint();
    });
  }

  function paint() {
    if (!allRows.length) {
      setRefreshVisible(false);
      showGlobalEmpty(
        renderEmptyState({
          kind: "empty",
          title: WorkerI18n.t("analytics.emptyTitle"),
          text: WorkerI18n.t("analytics.emptyText"),
          actions: [
            `<button type="button" class="btn btn-primary" id="analyticsGoSites">${WorkerFormat.escapeHtml(
              WorkerI18n.t("analytics.goSites")
            )}</button>`,
          ],
        })
      );
      document.getElementById("analyticsGoSites")?.addEventListener("click", () => {
        document.querySelector('.nav-item[data-view="sites"]')?.click();
      });
      return;
    }

    setRefreshVisible(true);
    ensureTableShell();
    const q = String(state.q || "").toLowerCase();
    const filtered = !q ? allRows : allRows.filter((row) => row.search.includes(q));
    const body = document.getElementById("analyticsBody");
    if (!body) return;

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7">${renderEmptyState({
        kind: "empty",
        title: WorkerI18n.t("analytics.noResultsTitle"),
        text: WorkerI18n.t("analytics.noResultsText"),
      })}</td></tr>`;
      return;
    }

    body.innerHTML = filtered.map((row) => renderLinkRow(row, row.index)).join("");
    bindRowClicks();
  }

  async function load({ force = false } = {}) {
    closeDrawer();
    ensureTableShell();
    const body = document.getElementById("analyticsBody");
    if (body) {
      body.innerHTML = `<tr><td colspan="7" class="panel-empty">${WorkerFormat.escapeHtml(
        WorkerI18n.t("common.loading")
      )}</td></tr>`;
    }

    try {
      const domainsData = await WorkerAPI.get("/sites/domains?includeLinks=1", { force });
      const domains = domainsData.domains || [];

      allRows = [];
      for (const domain of domains) {
        const links = (Array.isArray(domain.links) ? domain.links : []).filter(
          (link) => link && typeof link === "object"
        );
        for (const link of links) {
          const url = linkLabel(link, domain.domain);
          allRows.push({
            index: allRows.length,
            search: `${url} ${domain.domain}`.toLowerCase(),
            url,
            link,
            domain,
            views: Number(link.stats?.views || 0),
          });
        }
      }
      allRows.sort((a, b) => b.views - a.views);
      allRows.forEach((row, i) => {
        row.index = i;
      });
      paint();
    } catch (error) {
      setRefreshVisible(false);
      if (window.WorkerToast) WorkerToast.error(error);
      showGlobalEmpty(
        renderEmptyState({
          kind: "error",
          title: WorkerI18n.t("analytics.errorTitle"),
          text:
            (window.WorkerToast && WorkerToast.friendlyError(error)) ||
            error.message ||
            WorkerI18n.t("common.error"),
          actions: [
            `<button type="button" class="btn btn-ghost" id="analyticsRetry">${WorkerFormat.escapeHtml(
              WorkerI18n.t("common.retry")
            )}</button>`,
          ],
        })
      );
      document.getElementById("analyticsRetry")?.addEventListener("click", () =>
        load({ force: true })
      );
    }
  }

  document.getElementById("analyticsRefresh")?.addEventListener("click", () =>
    load({ force: true })
  );
  document.getElementById("analyticsSearch")?.addEventListener("input", (e) => {
    state.q = e.target.value.trim();
    paint();
  });
  document.getElementById("analyticsDrawerBackdrop")?.addEventListener("click", closeDrawer);
  if (!WorkerViews.analyticsState._escBound) {
    WorkerViews.analyticsState._escBound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const drawer = document.getElementById("analyticsDrawer");
      if (drawer && !drawer.hidden) closeDrawer();
    });
  }

  await load({ force: !!ctx.refresh });
};
