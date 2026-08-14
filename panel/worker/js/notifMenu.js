window.WorkerNotifMenu = (function () {
  let open = false;
  let loading = false;

  function els() {
    return {
      wrap: document.getElementById("notifWrap"),
      bell: document.getElementById("notifBell"),
      menu: document.getElementById("notifMenu"),
      list: document.getElementById("notifMenuList"),
      badge: document.getElementById("notifBellBadge"),
      markAll: document.getElementById("notifMarkAllBtn"),
    };
  }

  function setOpen(next) {
    open = !!next;
    const { wrap, bell, menu } = els();
    if (!wrap || !bell || !menu) return;
    menu.hidden = !open;
    bell.setAttribute("aria-expanded", String(open));
    wrap.classList.toggle("is-open", open);
    if (open) {
      if (typeof window.closeWorkerProfileMenu === "function") {
        window.closeWorkerProfileMenu();
      }
      refreshList({ force: true });
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function updateBadge(items) {
    const { badge, wrap } = els();
    const menuDot = document.getElementById("menuNotifDot");
    const count = WorkerNotif.unreadCount(items || []);
    const hasUnread = count > 0;

    if (badge) {
      badge.hidden = !hasUnread;
      badge.textContent = hasUnread ? (count > 99 ? "99+" : String(count)) : "";
      badge.setAttribute("aria-hidden", hasUnread ? "false" : "true");
    }
    if (wrap) wrap.classList.toggle("has-unread", hasUnread);
    if (menuDot) menuDot.hidden = !hasUnread;
  }

  function severityClass(item) {
    if (item.severity === "danger") return "is-danger";
    if (item.severity === "warn") return "is-warn";
    if (item.severity === "info") return "is-info";
    return "";
  }

  function openExternalUrl(url) {
    const href = String(url || "").trim();
    if (!href) return;
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(href);
      return;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function navigateNotifItem(btn) {
    const linkType = String(btn.dataset.linkType || "").trim();
    if (linkType === "view" && btn.dataset.linkView) {
      setOpen(false);
      document.querySelector(`.nav-item[data-view="${btn.dataset.linkView}"]`)?.click();
      return;
    }
    if (linkType === "url" && btn.dataset.linkUrl) {
      setOpen(false);
      openExternalUrl(btn.dataset.linkUrl);
      return;
    }
    if (btn.dataset.domainId) {
      setOpen(false);
      if (WorkerViews.sitesState) {
        WorkerViews.sitesState.selectedId = Number(btn.dataset.domainId);
      }
      document.querySelector('.nav-item[data-view="sites"]')?.click();
    }
  }

  function renderItems(items) {
    const { list } = els();
    if (!list) return;

    if (!items.length) {
      list.innerHTML = `<div class="notif-menu-empty">${WorkerFormat.escapeHtml(
        WorkerI18n.t("notif.empty")
      )}</div>`;
      return;
    }

    list.innerHTML = items
      .map((item) => {
        const sev = severityClass(item);
        const msgHtml = item.messageHtml
          ? `<span class="notif-menu-msg notif-menu-msg-html">${item.messageHtml}</span>`
          : `<span class="notif-menu-msg">${WorkerFormat.escapeHtml(item.message || "")}</span>`;
        const linkType = item.linkType || (item.domainId ? "domain" : "none");
        return `
          <button type="button" class="notif-menu-item ${sev}${item.read ? " is-read" : ""}" data-notif-id="${WorkerFormat.escapeHtml(String(item.id))}" data-link-type="${WorkerFormat.escapeHtml(linkType)}" data-link-view="${WorkerFormat.escapeHtml(String(item.linkView || ""))}" data-link-url="${WorkerFormat.escapeHtml(String(item.linkUrl || ""))}" data-domain-id="${WorkerFormat.escapeHtml(String(item.domainId || ""))}">
            <span class="notif-menu-dot" aria-hidden="true"></span>
            <span class="notif-menu-body">
              <span class="notif-menu-title">${WorkerFormat.escapeHtml(item.title || "")}</span>
              ${msgHtml}
              <span class="notif-menu-time">${WorkerFormat.escapeHtml(
                WorkerFormat.shortDayTime(item.createdAt)
              )}</span>
            </span>
          </button>`;
      })
      .join("");

    list.querySelectorAll(".notif-menu-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        if (e.target.closest("a")) return;
        const alertId = btn.dataset.notifId;
        btn.classList.add("is-read");
        try {
          const itemsAfter = await WorkerNotif.markRead(alertId);
          if (itemsAfter) updateBadge(itemsAfter);
          else refreshBadgeOnly();
        } catch (error) {
          if (window.WorkerToast) WorkerToast.error(error);
          btn.classList.remove("is-read");
          return;
        }
        navigateNotifItem(btn);
      });
    });
  }

  async function refreshBadgeOnly() {
    try {
      const items = await WorkerNotif.fetchAlerts();
      updateBadge(items);
    } catch (_) {
      updateBadge([]);
    }
  }

  async function refreshList({ force = false } = {}) {
    const { list } = els();
    if (!list || loading) return;
    loading = true;
    list.innerHTML = `<div class="notif-menu-empty">${WorkerFormat.escapeHtml(
      WorkerI18n.t("common.loading")
    )}</div>`;
    try {
      const items = await WorkerNotif.fetchAlerts({ force });
      updateBadge(items);
      renderItems(items);
    } catch (error) {
      if (window.WorkerToast) WorkerToast.error(error);
      list.innerHTML = `<div class="notif-menu-empty">${WorkerFormat.escapeHtml(
        (window.WorkerToast && WorkerToast.friendlyError(error)) ||
          error.message ||
          WorkerI18n.t("common.error")
      )}</div>`;
    } finally {
      loading = false;
    }
  }

  function bind() {
    const { bell, markAll, menu, wrap } = els();
    if (!bell || !menu || !wrap) return;

    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });

    markAll?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const items = await WorkerNotif.fetchAlerts({ force: true });
        const updated = await WorkerNotif.markAllRead(items.map((i) => i.id));
        const next = updated || items.map((i) => ({ ...i, read: true }));
        updateBadge(next);
        renderItems(next);
        if (window.WorkerToast) WorkerToast.success(WorkerI18n.t("notif.marked"));
      } catch (error) {
        if (window.WorkerToast) WorkerToast.error(error);
      }
    });

    document.addEventListener("click", (e) => {
      if (!open) return;
      if (wrap.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) setOpen(false);
    });
  }

  return {
    bind,
    setOpen,
    refreshList,
    refreshBadge: refreshBadgeOnly,
    updateBadge,
  };
})();
