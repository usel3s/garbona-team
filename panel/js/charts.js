window.PanelCharts = (function () {
  function renderBarChart(container, series, options = {}) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("chart-wrap");

    const empty =
      Boolean(options.empty) && (!series.length || series.every((s) => !Number(s.value || 0)));

    if (empty) {
      container.classList.add("is-empty");
      const emptyEl = document.createElement("div");
      emptyEl.className = "chart-empty";
      emptyEl.textContent = options.empty;
      container.appendChild(emptyEl);
      return;
    }

    container.classList.remove("is-empty");

    const barsEl = document.createElement("div");
    barsEl.className = "chart-bars";
    const labelsEl = document.createElement("div");
    labelsEl.className = "chart-labels";
    const tip = document.createElement("div");
    tip.className = "chart-tooltip";
    tip.hidden = true;
    tip.innerHTML = `<div class="chart-tooltip-date"></div><div class="chart-tooltip-value"></div>`;

    const max = Math.max(1, ...series.map((s) => Number(s.value || 0)));

    series.forEach((item) => {
      const bar = document.createElement("div");
      bar.className = "chart-bar";
      const pct = Math.max(8, (Number(item.value || 0) / max) * 100);
      bar.style.height = `${pct}%`;

      bar.addEventListener("mouseenter", (e) => {
        tip.hidden = false;
        tip.querySelector(".chart-tooltip-date").textContent = item.label || item.date || "";
        tip.querySelector(".chart-tooltip-value").textContent =
          item.detail || `${item.display || item.value}${item.count != null ? ` · ${item.count} проф.` : ""}`;
        positionTip(container, tip, e.currentTarget);
      });
      bar.addEventListener("mousemove", (e) => {
        positionTip(container, tip, e.currentTarget);
      });
      bar.addEventListener("mouseleave", () => {
        tip.hidden = true;
      });

      barsEl.appendChild(bar);

      const lab = document.createElement("span");
      lab.textContent = item.shortLabel || item.label || "";
      labelsEl.appendChild(lab);
    });

    container.appendChild(barsEl);
    container.appendChild(labelsEl);
    container.appendChild(tip);
  }

  function positionTip(container, tip, bar) {
    const cRect = container.getBoundingClientRect();
    const bRect = bar.getBoundingClientRect();
    const x = bRect.left + bRect.width / 2 - cRect.left;
    tip.style.left = `${x}px`;
    tip.style.bottom = `${cRect.bottom - bRect.top + 10}px`;
  }

  return { renderBarChart };
})();
