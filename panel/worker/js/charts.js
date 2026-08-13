window.WorkerCharts = (function () {
  function niceMax(value) {
    const v = Math.max(0, Number(value) || 0);
    if (v <= 1) return 1;
    if (v <= 5) return Math.ceil(v);
    const pow = 10 ** Math.floor(Math.log10(v));
    const n = v / pow;
    if (n <= 1) return pow;
    if (n <= 2) return 2 * pow;
    if (n <= 5) return 5 * pow;
    return 10 * pow;
  }

  function buildTicks(max, count = 4) {
    const m = niceMax(max);
    if (m <= 1) {
      return { max: 1, ticks: [0, 1] };
    }
    const ticks = [];
    for (let i = 0; i < count; i += 1) {
      ticks.push(Number(((m * i) / (count - 1)).toFixed(4)));
    }
    return { max: m, ticks };
  }

  function formatCountTick(tick) {
    return String(Math.round(tick));
  }

  function uniqueAxisLabels(ticks, formatter) {
    const seen = new Set();
    const out = [];
    ticks.forEach((tick) => {
      const label = formatter(tick);
      if (seen.has(label)) return;
      seen.add(label);
      out.push({ tick, label });
    });
    return out;
  }

  function polylinePoints(values, xAt, yAt) {
    if (!values.length) return "";
    return values
      .map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
      .join(" ");
  }

  function xLabelStep(count, plotWidth, minLabelPx = 46) {
    if (count <= 1) return 1;
    const maxLabels = Math.max(2, Math.floor(plotWidth / minLabelPx));
    return Math.max(1, Math.ceil((count - 1) / Math.max(1, maxLabels - 1)));
  }

  function xLabelIndices(count, step) {
    if (count <= 0) return [];
    if (count === 1) return [0];
    const indices = [];
    for (let i = 0; i < count; i += step) indices.push(i);
    if (indices[indices.length - 1] !== count - 1) indices.push(count - 1);
    return indices;
  }

  function renderDynamicsChart(container, points, options = {}) {
    if (!container) return;

    const rows = Array.isArray(points) ? points : [];
    let resizeObserver = null;

    function destroyChart() {
      resizeObserver?.disconnect();
      resizeObserver = null;
      container.innerHTML = "";
    }

    destroyChart();
    container.className = "chart-area dynamics-chart";

    if (!rows.length) {
      container.classList.add("is-empty");
      const emptyEl = document.createElement("div");
      emptyEl.className = "dynamics-empty";
      emptyEl.textContent = options.empty || "";
      container.appendChild(emptyEl);
      return;
    }

    container.classList.remove("is-empty");

    const logsCounts = rows.map((p) => Number(p.logsCount || 0));
    const mafileCounts = rows.map((p) => Number(p.mafileCount || 0));
    const profitAmounts = rows.map((p) => Number(p.profitUsd || 0));
    const countScale = buildTicks(Math.max(...logsCounts, ...mafileCounts, 0));
    const amountScale = buildTicks(Math.max(...profitAmounts, 0));
    const n = rows.length;

    const pad = { top: 12, right: 44, bottom: 28, left: 28 };
    const H = 220;

    let showLogs = true;
    let showMafile = true;
    let showProfit = true;
    let logsLine;
    let mafileLine;
    let profitLine;
    let dots;
    let tip;
    let wrap;
    let resizeScheduled = false;

    function measureWidth() {
      const host = container.closest(".section") || container.parentElement || container;
      const width = host?.clientWidth ? host.clientWidth - 24 : container.clientWidth;
      return Math.max(280, width || 280);
    }

    function scheduleDraw() {
      if (resizeScheduled) return;
      resizeScheduled = true;
      requestAnimationFrame(() => {
        resizeScheduled = false;
        drawChart();
      });
    }

    function drawChart() {
      const W = measureWidth();
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;
      const labelStep = xLabelStep(n, plotW);
      const labelIndices = xLabelIndices(n, labelStep);
      const gridIndices = labelStep > 1 ? labelIndices : rows.map((_, i) => i);

      const xAt = (i) => pad.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
      const yCount = (v) => pad.top + plotH - (v / countScale.max) * plotH;
      const yAmount = (v) => pad.top + plotH - (v / amountScale.max) * plotH;

      if (!wrap) {
        const svgNS = "http://www.w3.org/2000/svg";
        wrap = document.createElement("div");
        wrap.className = "dynamics-chart-inner";

        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("class", "dynamics-svg");
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", String(H));

        const grid = document.createElementNS(svgNS, "g");
        grid.setAttribute("class", "dynamics-grid");
        svg.appendChild(grid);

        const baseline = document.createElementNS(svgNS, "line");
        baseline.setAttribute("class", "dynamics-axis-line");
        svg.appendChild(baseline);

        const leftAxis = document.createElementNS(svgNS, "g");
        leftAxis.setAttribute("class", "dynamics-axis dynamics-axis-left");
        svg.appendChild(leftAxis);

        const rightAxis = document.createElementNS(svgNS, "g");
        rightAxis.setAttribute("class", "dynamics-axis dynamics-axis-right");
        svg.appendChild(rightAxis);

        const xLabels = document.createElementNS(svgNS, "g");
        xLabels.setAttribute("class", "dynamics-x-labels");
        svg.appendChild(xLabels);

        logsLine = document.createElementNS(svgNS, "polyline");
        logsLine.setAttribute("class", "dynamics-line dynamics-line-logs");
        logsLine.setAttribute("fill", "none");
        svg.appendChild(logsLine);

        mafileLine = document.createElementNS(svgNS, "polyline");
        mafileLine.setAttribute("class", "dynamics-line dynamics-line-mafile");
        mafileLine.setAttribute("fill", "none");
        svg.appendChild(mafileLine);

        profitLine = document.createElementNS(svgNS, "polyline");
        profitLine.setAttribute("class", "dynamics-line dynamics-line-profit");
        profitLine.setAttribute("fill", "none");
        svg.appendChild(profitLine);

        dots = document.createElementNS(svgNS, "g");
        dots.setAttribute("class", "dynamics-dots");
        svg.appendChild(dots);

        wrap.appendChild(svg);

        tip = document.createElement("div");
        tip.className = "dynamics-tooltip";
        tip.hidden = true;
        tip.innerHTML = `
          <div class="dynamics-tooltip-date"></div>
          <div class="dynamics-tooltip-row dynamics-tooltip-logs">
            <span class="dynamics-tooltip-swatch"></span>
            <span class="dynamics-tooltip-text"></span>
          </div>
          <div class="dynamics-tooltip-row dynamics-tooltip-mafile">
            <span class="dynamics-tooltip-swatch"></span>
            <span class="dynamics-tooltip-text"></span>
          </div>
          <div class="dynamics-tooltip-row dynamics-tooltip-profit">
            <span class="dynamics-tooltip-swatch"></span>
            <span class="dynamics-tooltip-text"></span>
          </div>
        `;
        wrap.appendChild(tip);
        container.appendChild(wrap);

        if (options.legendLogsEl) {
          options.legendLogsEl.addEventListener("click", () => {
            showLogs = !showLogs;
            options.legendLogsEl.classList.toggle("is-off", !showLogs);
            applyVisibility();
          });
        }
        if (options.legendMafileEl) {
          options.legendMafileEl.addEventListener("click", () => {
            showMafile = !showMafile;
            options.legendMafileEl.classList.toggle("is-off", !showMafile);
            applyVisibility();
          });
        }
        if (options.legendProfitEl) {
          options.legendProfitEl.addEventListener("click", () => {
            showProfit = !showProfit;
            options.legendProfitEl.classList.toggle("is-off", !showProfit);
            applyVisibility();
          });
        }

        if (typeof ResizeObserver !== "undefined") {
          const observeTarget = container.closest(".section") || container.parentElement || container;
          resizeObserver = new ResizeObserver(scheduleDraw);
          resizeObserver.observe(observeTarget);
        }
      }

      const svg = wrap.querySelector("svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

      const grid = svg.querySelector(".dynamics-grid");
      grid.innerHTML = "";
      gridIndices.forEach((i) => {
        const x = xAt(i);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x);
        line.setAttribute("x2", x);
        line.setAttribute("y1", pad.top);
        line.setAttribute("y2", pad.top + plotH);
        grid.appendChild(line);
      });

      const baseline = svg.querySelector(".dynamics-axis-line");
      baseline.setAttribute("x1", pad.left);
      baseline.setAttribute("x2", pad.left + plotW);
      baseline.setAttribute("y1", pad.top + plotH);
      baseline.setAttribute("y2", pad.top + plotH);

      const leftAxis = svg.querySelector(".dynamics-axis-left");
      leftAxis.innerHTML = "";
      uniqueAxisLabels(countScale.ticks, formatCountTick).forEach(({ tick, label }) => {
        const y = yCount(tick);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", pad.left - 8);
        text.setAttribute("y", y + 3);
        text.setAttribute("text-anchor", "end");
        text.textContent = label;
        leftAxis.appendChild(text);
      });

      const rightAxis = svg.querySelector(".dynamics-axis-right");
      rightAxis.innerHTML = "";
      const formatAmount = (tick) =>
        options.formatAmountTick ? options.formatAmountTick(tick) : `$${tick}`;
      uniqueAxisLabels(amountScale.ticks, formatAmount).forEach(({ tick, label }) => {
        const y = yAmount(tick);
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", pad.left + plotW + 8);
        text.setAttribute("y", y + 3);
        text.setAttribute("text-anchor", "start");
        text.textContent = label;
        rightAxis.appendChild(text);
      });

      const xLabels = svg.querySelector(".dynamics-x-labels");
      xLabels.innerHTML = "";
      labelIndices.forEach((i) => {
        const row = rows[i];
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", xAt(i));
        label.setAttribute("y", H - 8);
        label.setAttribute("text-anchor", "middle");
        label.textContent = row.label || row.date || "";
        xLabels.appendChild(label);
      });

      logsLine.setAttribute("points", polylinePoints(logsCounts, xAt, yCount));
      mafileLine.setAttribute("points", polylinePoints(mafileCounts, xAt, yCount));
      profitLine.setAttribute("points", polylinePoints(profitAmounts, xAt, yAmount));

      dots.innerHTML = "";
      rows.forEach((row, i) => {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "dynamics-dot-group");
        g.dataset.index = String(i);

        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        const band = n <= 1 ? plotW : plotW / (n - 1);
        hit.setAttribute("x", xAt(i) - band / 2);
        hit.setAttribute("y", pad.top);
        hit.setAttribute("width", band);
        hit.setAttribute("height", plotH);
        hit.setAttribute("class", "dynamics-hit");
        g.appendChild(hit);

        const cLogs = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        cLogs.setAttribute("class", "dynamics-dot dynamics-dot-logs");
        cLogs.setAttribute("cx", xAt(i));
        cLogs.setAttribute("cy", yCount(logsCounts[i]));
        cLogs.setAttribute("r", 3.5);
        g.appendChild(cLogs);

        const cMafile = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        cMafile.setAttribute("class", "dynamics-dot dynamics-dot-mafile");
        cMafile.setAttribute("cx", xAt(i));
        cMafile.setAttribute("cy", yCount(mafileCounts[i]));
        cMafile.setAttribute("r", 3.5);
        g.appendChild(cMafile);

        const cProfit = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        cProfit.setAttribute("class", "dynamics-dot dynamics-dot-profit");
        cProfit.setAttribute("cx", xAt(i));
        cProfit.setAttribute("cy", yAmount(profitAmounts[i]));
        cProfit.setAttribute("r", 3.5);
        g.appendChild(cProfit);

        g.addEventListener("mouseenter", (e) => showTip(Number(g.dataset.index), e.clientX));
        g.addEventListener("mousemove", (e) => showTip(Number(g.dataset.index), e.clientX));
        g.addEventListener("mouseleave", () => {
          tip.hidden = true;
        });

        dots.appendChild(g);
      });

      applyVisibility();
    }

    function applyVisibility() {
      if (!logsLine || !mafileLine || !profitLine || !dots) return;
      logsLine.style.display = showLogs ? "" : "none";
      mafileLine.style.display = showMafile ? "" : "none";
      profitLine.style.display = showProfit ? "" : "none";
      dots.querySelectorAll(".dynamics-dot-logs").forEach((el) => {
        el.style.display = showLogs ? "" : "none";
      });
      dots.querySelectorAll(".dynamics-dot-mafile").forEach((el) => {
        el.style.display = showMafile ? "" : "none";
      });
      dots.querySelectorAll(".dynamics-dot-profit").forEach((el) => {
        el.style.display = showProfit ? "" : "none";
      });
    }

    function showTip(index, clientX) {
      const row = rows[index];
      if (!row || !tip || !wrap) return;
      tip.hidden = false;
      tip.querySelector(".dynamics-tooltip-date").textContent = row.label || row.date || "";
      tip.querySelector(".dynamics-tooltip-logs .dynamics-tooltip-text").textContent =
        `${options.logsLabel || "Logs"}: ${row.logsCount || 0}`;
      tip.querySelector(".dynamics-tooltip-mafile .dynamics-tooltip-text").textContent =
        `${options.mafileLabel || "MaFile"}: ${row.mafileCount || 0}`;
      tip.querySelector(".dynamics-tooltip-profit .dynamics-tooltip-text").textContent =
        `${options.profitLabel || "Profit"}: ${row.profitDisplay || row.profitUsd || 0}`;

      const rect = wrap.getBoundingClientRect();
      const x = clientX - rect.left;
      tip.style.left = `${Math.max(72, Math.min(rect.width - 72, x))}px`;
      tip.style.top = "24px";
    }

    requestAnimationFrame(() => requestAnimationFrame(scheduleDraw));
  }

  return { renderDynamicsChart };
})();
