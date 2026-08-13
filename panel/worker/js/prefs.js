window.WorkerPrefs = (function () {
  const STORAGE_KEY = "garbona_worker_prefs";
  const DEFAULTS = {
    lang: "ru",
    theme: "dark",
    currency: "USD",
    defaultPeriod: 7,
  };

  let state = { ...DEFAULTS };
  let rate = 90;
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.lang === "ru" || parsed.lang === "en") state.lang = parsed.lang;
      if (parsed.theme === "dark" || parsed.theme === "light") state.theme = parsed.theme;
      if (parsed.currency === "USD" || parsed.currency === "RUB") state.currency = parsed.currency;
      const period = Number(parsed.defaultPeriod);
      if ([7, 14, 30].includes(period)) state.defaultPeriod = period;
    } catch (_) {}
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function applyDom() {
    document.documentElement.lang = state.lang;
    document.documentElement.dataset.theme = state.theme;
    const themeColor = state.theme === "light" ? "#f5f5f5" : "#090909";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }

  function get() {
    return { ...state, rate };
  }

  function setRate(value) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0) rate = next;
  }

  function set(partial) {
    let changed = false;
    if (partial.lang && (partial.lang === "ru" || partial.lang === "en") && partial.lang !== state.lang) {
      state.lang = partial.lang;
      changed = true;
    }
    if (
      partial.theme &&
      (partial.theme === "dark" || partial.theme === "light") &&
      partial.theme !== state.theme
    ) {
      state.theme = partial.theme;
      changed = true;
    }
    if (
      partial.currency &&
      (partial.currency === "USD" || partial.currency === "RUB") &&
      partial.currency !== state.currency
    ) {
      state.currency = partial.currency;
      changed = true;
    }
    if (partial.defaultPeriod != null) {
      const period = Number(partial.defaultPeriod);
      if ([7, 14, 30].includes(period) && period !== state.defaultPeriod) {
        state.defaultPeriod = period;
        changed = true;
      }
    }
    if (!changed) return false;
    save();
    applyDom();
    listeners.forEach((fn) => fn(get()));
    return true;
  }

  function toggleLang() {
    return set({ lang: state.lang === "ru" ? "en" : "ru" });
  }

  function toggleTheme() {
    return set({ theme: state.theme === "dark" ? "light" : "dark" });
  }

  function toggleCurrency() {
    return set({ currency: state.currency === "USD" ? "RUB" : "USD" });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function init() {
    load();
    applyDom();
  }

  return {
    init,
    get,
    set,
    setRate,
    toggleLang,
    toggleTheme,
    toggleCurrency,
    onChange,
  };
})();
