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
        const sev = item.severity === "danger" ? "is-danger" : "is-warn";
        return `
          <button type="button" class="notif-menu-item ${sev}${item.read ? " is-read" : ""}" data-notif-id="${WorkerFormat.escapeHtml(String(item.id))}" data-domain-id="${WorkerFormat.escapeHtml(String(item.domainId || ""))}">
            <span class="notif-menu-dot" aria-hidden="true"></span>
            <span class="notif-menu-body">
              <span class="notif-menu-title">${WorkerFormat.escapeHtml(item.title || "")}</span>
              <span class="notif-menu-msg">${WorkerFormat.escapeHtml(item.message || "")}</span>
              <span class="notif-menu-time">${WorkerFormat.escapeHtml(
                WorkerFormat.shortDayTime(item.createdAt)
              )}</span>
            </span>
          </button>`;
      })
      .join("");

    list.querySelectorAll(".notif-menu-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        WorkerNotif.markRead(btn.dataset.notifId);
        btn.classList.add("is-read");
        refreshBadgeOnly();
        if (btn.dataset.domainId) {
          setOpen(false);
          if (WorkerViews.sitesState) {
            WorkerViews.sitesState.selectedId = Number(btn.dataset.domainId);
          }
          document.querySelector('.nav-item[data-view="sites"]')?.click();
        }
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
        WorkerNotif.markAllRead(items.map((i) => i.id));
        updateBadge(items.map((i) => ({ ...i, read: true })));
        renderItems(items.map((i) => ({ ...i, read: true })));
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
