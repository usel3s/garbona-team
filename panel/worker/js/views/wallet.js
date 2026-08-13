window.WorkerViews = window.WorkerViews || {};

WorkerViews.walletState = {
  tab: "profits", // profits | withdrawals
  wallet: null,
  history: [],
  historyLoaded: false,
};

function statusBadgeClassForWithdrawal(status) {
  const raw = String(status || "").toLowerCase();
  if (raw === "approved") return "ok";
  if (raw === "rejected") return "bad";
  if (raw === "pending" || raw === "awaiting_payout_link") return "warn";
  return "";
}

function statusLabelForWithdrawal(status) {
  const raw = String(status || "").toLowerCase();
  if (raw === "approved") return WorkerI18n.t("wallet.statusApproved");
  if (raw === "rejected") return WorkerI18n.t("wallet.statusRejected");
  if (raw === "awaiting_payout_link") return WorkerI18n.t("wallet.statusAwaiting");
  if (raw === "pending") return WorkerI18n.t("wallet.statusPending");
  return status || "—";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderWalletAddressCell(address) {
  const addr = String(address || "").trim();
  if (!addr) return `<span class="muted">—</span>`;

  const headLen = Math.min(6, Math.max(2, Math.floor(addr.length * 0.22)));
  const tailLen = Math.min(4, Math.max(2, Math.floor(addr.length * 0.14)));
  const head = addr.slice(0, headLen);
  const tail = addr.length > headLen + tailLen ? addr.slice(-tailLen) : "";
  const mid = addr.slice(headLen, tail ? -tailLen : undefined) || "••••";

  return `
    <button
      type="button"
      class="wallet-addr"
      data-address="${escapeHtml(addr)}"
      title="${escapeHtml(WorkerI18n.t("wallet.copyHint") || "Наведите, чтобы увидеть · нажмите, чтобы скопировать")}"
    >
      <span class="wallet-addr-peek" aria-hidden="true">
        <span class="wallet-addr-clear">${escapeHtml(head)}</span><span class="wallet-addr-blur">${escapeHtml(mid)}</span><span class="wallet-addr-clear">${escapeHtml(tail)}</span>
      </span>
      <span class="wallet-addr-full">${escapeHtml(addr)}</span>
    </button>`;
}

function bindWalletAddressCopy(root) {
  root?.querySelectorAll(".wallet-addr").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = String(btn.dataset.address || "").trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        if (window.WorkerToast) {
          WorkerToast.success(WorkerI18n.t("wallet.copied") || "Адрес скопирован");
        }
      } catch (_) {
        if (window.WorkerToast) {
          WorkerToast.error(WorkerI18n.t("wallet.copyFailed") || "Не удалось скопировать");
        }
      }
    });
  });
}

function renderHistoryTable(items, tab) {
  if (!items || !items.length) {
    return `<div class="empty">${escapeHtml(
      WorkerI18n.t("wallet.empty") || "Нет транзакций"
    )}</div>`;
  }

  if (tab === "profits") {
    return `
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>${escapeHtml(WorkerI18n.t("wallet.historyDate") || "Дата")}</th>
              <th>${escapeHtml(WorkerI18n.t("wallet.historyType") || "Тип")}</th>
              <th class="col-num">${escapeHtml(WorkerI18n.t("wallet.historyAmount") || "Сумма")}</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (p) => `
              <tr>
                <td class="muted">${escapeHtml(WorkerFormat.date(p.createdAt))}</td>
                <td><span class="badge type">${escapeHtml(WorkerI18n.t("wallet.typeProfit"))}</span></td>
                <td class="td-num">${escapeHtml(WorkerFormat.money(p.amountUsd || 0))}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  return `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>${escapeHtml(WorkerI18n.t("wallet.historyDate") || "Дата")}</th>
            <th>${escapeHtml(WorkerI18n.t("wallet.historyType") || "Тип")}</th>
            <th>${escapeHtml(WorkerI18n.t("wallet.historyWallet") || "Кошелёк")}</th>
            <th class="col-num">${escapeHtml(WorkerI18n.t("wallet.historyAmount") || "Сумма")}</th>
            <th>${escapeHtml(WorkerI18n.t("wallet.historyStatus") || "Статус")}</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (t) => `
            <tr>
              <td class="muted">${escapeHtml(WorkerFormat.date(t.createdAt))}</td>
              <td><span class="badge type">${escapeHtml(t.method || "—")}</span></td>
              <td class="wallet-addr-cell">${renderWalletAddressCell(t.walletAddress || t.address || "")}</td>
              <td class="td-num">${escapeHtml(WorkerFormat.money(t.amountUsd || 0))}</td>
              <td><span class="badge ${statusBadgeClassForWithdrawal(t.status)}">${escapeHtml(
                statusLabelForWithdrawal(t.status)
              )}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function setHistoryHtml(items, tab) {
  const wrap = document.getElementById("walletHistoryWrap");
  if (!wrap) return;
  wrap.innerHTML = renderHistoryTable(items, tab);
  if (tab === "withdrawals") bindWalletAddressCopy(wrap);
}

async function loadWallet({ force = false } = {}) {
  const wallet = await WorkerAPI.get("/wallet", { force });
  return wallet || {};
}

async function loadHistory(tab, { force = false } = {}) {
  const res = await WorkerAPI.get(`/wallet/history?tab=${encodeURIComponent(tab)}`, { force });
  return res?.items || [];
}

WorkerViews.wallet = async function renderWallet(ctx) {
  const { main, user, refresh } = ctx;
  const force = !!refresh;

  main.innerHTML = `
    <h1 class="page-greeting">${WorkerI18n.t("wallet.greeting") || "Приветствуем,"} <em>${escapeHtml(
      user.firstName || user.username || user.telegramId
    )}</em></h1>

    <section class="section wallet-balance-card">
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(WorkerI18n.t("wallet.balanceTitle") || "Баланс")}</h2>
        <div style="display:flex;align-items:center;gap:10px;">
          <button type="button" class="btn btn-primary" id="walletWithdrawOpen">${escapeHtml(
            WorkerI18n.t("wallet.withdrawBtn") || "Вывести средства"
          )}</button>
        </div>
      </div>

      <div class="wallet-balance-body" style="padding: 14px 16px;">
        <div class="kpi-grid" style="max-width: 560px;">
          <div class="kpi-cell">
            <div class="kpi-label">${escapeHtml(
              WorkerI18n.t("wallet.totalBalanceLabel") || "Общий баланс"
            )}</div>
            <div class="kpi-value">${escapeHtml(WorkerFormat.money(user.walletUsd || 0))}</div>
          </div>
          <div class="kpi-cell">
            <div class="kpi-label">${escapeHtml(
              WorkerI18n.t("wallet.availableBalanceLabel") || "Доступно к выводу"
            )}</div>
            <div class="kpi-value" id="walletAvailableValue">—</div>
          </div>
        </div>
        <div class="kpi-hint" style="margin-top:8px;">
          ${escapeHtml(
            WorkerI18n.t("wallet.availableHint") ||
              "Комиссии и резервные выплаты учитываются при доступной сумме."
          )}
        </div>
      </div>
    </section>

    <section class="section wallet-history-section">
      <div class="section-head">
        <h2 class="section-title">${escapeHtml(WorkerI18n.t("wallet.historyTitle") || "История")}</h2>
        <div class="link-segments" id="walletHistoryTabs">
          <button type="button" class="link-segment is-active" data-wallet-tab="profits">${
            escapeHtml(WorkerI18n.t("wallet.tabProfits") || "Выплаты")
          }</button>
          <button type="button" class="link-segment" data-wallet-tab="withdrawals">${
            escapeHtml(WorkerI18n.t("wallet.tabWithdrawals") || "Выводы")
          }</button>
        </div>
      </div>

      <div id="walletHistoryWrap" style="padding: 6px 0 0;"></div>
    </section>

    <dialog class="sites-dialog" id="walletWithdrawDialog">
      <form method="dialog" class="sites-dialog-body" id="walletWithdrawForm">
        <h3 class="sites-dialog-title">${escapeHtml(
          WorkerI18n.t("wallet.withdrawDialogTitle") || "Вывод средств"
        )}</h3>

        <div class="settings-field" style="margin-top: 10px;">
          <label class="settings-label" for="walletWithdrawAmount">${escapeHtml(
            WorkerI18n.t("wallet.withdrawAmountLabel") || "Сумма"
          )}</label>
          <input class="input" id="walletWithdrawAmount" type="number" min="1" step="0.01" placeholder="10.00" />
          <div class="settings-hint" id="walletWithdrawMinHint"></div>
        </div>

        <div class="settings-field">
          <label class="settings-label">${escapeHtml(
            WorkerI18n.t("wallet.withdrawMethodLabel") || "Сеть/метод"
          )}</label>
          <div id="walletWithdrawMethodSelect" class="custom-select-host"></div>
        </div>

        <div class="settings-field">
          <label class="settings-label" for="walletWithdrawAddress">${escapeHtml(
            WorkerI18n.t("wallet.withdrawAddressLabel") || "Кошелёк / ссылка"
          )}</label>
          <input class="input" id="walletWithdrawAddress" placeholder="Адрес кошелька / ссылка" autocomplete="off" />
        </div>

        <div class="inline-alert" id="walletWithdrawError" style="display:none;"></div>
        <div class="kpi-hint" id="walletWithdrawPreview"></div>

        <div class="sites-dialog-actions" style="margin-top: 14px;">
          <button type="button" class="btn btn-ghost" id="walletWithdrawCancel">${escapeHtml(
            WorkerI18n.t("wallet.cancel") || "Отмена"
          )}</button>
          <button type="submit" class="btn btn-primary" id="walletWithdrawSubmit">${escapeHtml(
            WorkerI18n.t("wallet.submit") || "Отправить"
          )}</button>
        </div>
      </form>
    </dialog>
  `;

  // Load wallet data + available value.
  const initialTab = WorkerViews.walletState.tab || "profits";
  const [wallet, initialItems] = await Promise.all([
    loadWallet({ force }),
    loadHistory(initialTab, { force }),
  ]);
  WorkerViews.walletState.wallet = wallet;
  document.getElementById("walletAvailableValue").textContent = WorkerFormat.money(wallet.availableUsd || 0);

  const minWithdrawalUsd = Number(wallet.minWithdrawalUsd || envMinFallback());
  function envMinFallback() {
    try {
      // eslint-disable-next-line no-undef
      return Number((window?.WorkerPrefs?.get?.()?.minWithdrawalUsd) || 10);
    } catch (_) {
      return 10;
    }
  }

  const methods = wallet.methods || [];
  const userPayoutMethod = wallet.user?.payoutMethod || "";
  const userPayoutAddress = wallet.user?.payoutAddress || "";

  document.getElementById("walletWithdrawMinHint").textContent = `Минимум: $${minWithdrawalUsd.toFixed(2)}`;

  const historyTabs = document.getElementById("walletHistoryTabs");
  historyTabs.querySelectorAll("button[data-wallet-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      WorkerViews.walletState.tab = btn.dataset.walletTab;
      historyTabs.querySelectorAll("button[data-wallet-tab]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const items = await loadHistory(WorkerViews.walletState.tab);
      WorkerViews.walletState.history = items;
      setHistoryHtml(items, WorkerViews.walletState.tab);
    });
  });

  historyTabs.querySelectorAll("button[data-wallet-tab]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.walletTab === initialTab);
  });
  WorkerViews.walletState.history = initialItems;
  setHistoryHtml(initialItems, initialTab);

  const dialog = document.getElementById("walletWithdrawDialog");
  const form = document.getElementById("walletWithdrawForm");
  const errBox = document.getElementById("walletWithdrawError");
  const previewEl = document.getElementById("walletWithdrawPreview");

  function showError(msg) {
    errBox.textContent = msg;
    errBox.style.display = "block";
  }
  function clearError() {
    errBox.textContent = "";
    errBox.style.display = "none";
  }

  // Mount method dropdown once.
  const methodSelectEl = document.getElementById("walletWithdrawMethodSelect");
  methodDropdown = WorkerDropdown.mount(methodSelectEl, {
    value: userPayoutMethod,
    ariaLabel: WorkerI18n.t("wallet.withdrawMethodLabel") || "Метод",
    options: [
      { value: "", label: WorkerI18n.t("wallet.methodNotSelected") || "Не выбран" },
      ...methods.map((m) => ({
        value: m.id,
        label: `${m.label} (fee $${Number(m.feeUsd || 0).toFixed(2)})`,
      })),
    ],
    onChange: () => {
      if (!dialog.open) return;
      clearError();
      updatePreview();
    },
  });

  const amountInput = document.getElementById("walletWithdrawAmount");
  const addressInput = document.getElementById("walletWithdrawAddress");

  amountInput.value = "";
  addressInput.value = userPayoutAddress;

  function currentFeeUsd() {
    const selected = methodDropdown?.getValue?.() || "";
    const m = methods.find((x) => String(x.id) === String(selected));
    return Number(m?.feeUsd || 0);
  }

  function updatePreview() {
    const amountUsd = Number(amountInput.value);
    const method = methodDropdown?.getValue?.() || "";
    const feeUsd = currentFeeUsd();
    const payoutAmount = Number.isFinite(amountUsd) ? Number(Math.max(0, amountUsd - feeUsd).toFixed(2)) : 0;

    if (!amountInput.value || !method) {
      previewEl.textContent = "";
      return;
    }
    previewEl.textContent = `Комиссия: $${feeUsd.toFixed(2)} · К выплате: $${payoutAmount.toFixed(2)}`;
  }

  amountInput.addEventListener("input", () => {
    clearError();
    updatePreview();
  });

  document.getElementById("walletWithdrawOpen").addEventListener("click", () => {
    clearError();
    previewEl.textContent = "";
    amountInput.value = "";
    addressInput.value = userPayoutAddress || "";

    if (methodDropdown) methodDropdown.setValue(userPayoutMethod || "");
    if (minWithdrawalUsd) {
      document.getElementById("walletWithdrawMinHint").textContent = `Минимум: $${minWithdrawalUsd.toFixed(2)}`;
    }
    dialog.showModal();
  });

  document.getElementById("walletWithdrawCancel").addEventListener("click", () => {
    dialog.close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const amountUsd = Number(amountInput.value);
    const availableUsd = Number(wallet.availableUsd || 0);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) return showError("Введите корректную сумму.");
    if (amountUsd < minWithdrawalUsd) {
      return showError(`Минимальная сумма вывода: $${minWithdrawalUsd.toFixed(2)}.`);
    }
    if (amountUsd > availableUsd) {
      return showError("Сумма превышает доступный остаток.");
    }

    const method = String(methodDropdown?.getValue?.() || "").trim();
    if (!method) return showError("Выберите сеть/метод.");

    const address = String(addressInput.value || "").trim();
    if (!address) return showError("Укажите адрес кошелька / ссылку.");

    try {
      await WorkerAPI.post("/wallet/withdraw", {
        amount: amountUsd,
        method,
        address,
      });
      dialog.close();
      // Refresh wallet + history.
      WorkerViews.walletState.wallet = await loadWallet({ force: true });
      const nextWallet = WorkerViews.walletState.wallet;
      document.getElementById("walletAvailableValue").textContent = WorkerFormat.money(nextWallet.availableUsd || 0);

      const items = await loadHistory(WorkerViews.walletState.tab, { force: true });
      WorkerViews.walletState.history = items;
      setHistoryHtml(items, WorkerViews.walletState.tab);
    } catch (error) {
      showError(error?.message || "Ошибка вывода.");
    }
  });
};

