import { ELEMENT_DESCRIPTIONS, LIVE_SUMMARY_ORDER } from "./constants.js";
import { state } from "./state.js";
import { escapeHtml, formatObservationLabel, renderDualLine } from "./utils.js";

export function makeHeader(tableHead) {
  const cols = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i++) {
    cols.push(`${i}位`);
  }

  tableHead.innerHTML = `
    <tr>
      ${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}
    </tr>
  `;
}

export function getElementDescription(elementKey) {
  return ELEMENT_DESCRIPTIONS[elementKey] || "この要素の説明は未設定です。";
}

export function normalizeRank(rank) {
  if (rank === null || rank === undefined) return null;

  if (typeof rank === "number") {
    return Number.isFinite(rank) ? rank : null;
  }

  const text = String(rank).trim();
  if (!text) return null;

  const matched = text.match(/\d+/);
  if (!matched) return null;

  const value = Number(matched[0]);
  return Number.isFinite(value) ? value : null;
}

export function isTopRankItem(item) {
  const rankValue = normalizeRank(item?.rank);
  return rankValue === 1;
}

export function hasAnyRankIn(items) {
  if (!Array.isArray(items)) return false;
  return items.length > 0;
}

export function renderDebugPanel(debugBodyEl, debugDetailsEl) {
  if (!debugBodyEl || !debugDetailsEl) return;

  const debugState = state.debugState;

  const lines = [
    ["地域", debugState.selectedRegion],
    ["都道府県", `${debugState.selectedPrefName} (${debugState.selectedPref})`],
    ["月", debugState.selectedMonth],
    ["要素", `${debugState.selectedElementLabel} (${debugState.selectedElement})`],

    ["manifest path", debugState.manifest.path],
    ["manifest OK", String(debugState.manifest.ok)],
    ["manifest observationTime", debugState.manifest.observationTime || "-"],
    ["manifest generatedAt", debugState.manifest.generatedAt || "-"],
    ["manifest error", debugState.manifest.error || "-"],

    ["live-summary path", debugState.liveSummary.path || "-"],
    ["live-summary OK", String(debugState.liveSummary.ok)],
    ["live-summary itemCount", String(debugState.liveSummary.itemCount)],
    ["live-summary status", debugState.liveSummary.status || "-"],
    ["live-summary message", debugState.liveSummary.message || "-"],
    ["live-summary observationTime", debugState.liveSummary.observationTime || "-"],
    ["live-summary generatedAt", debugState.liveSummary.generatedAt || "-"],
    ["live-summary error", debugState.liveSummary.error || "-"],

    ["table path", debugState.table.path || "-"],
    ["table OK", String(debugState.table.ok)],
    ["table rowCount", String(debugState.table.rowCount)],
    ["table status", debugState.table.status || "-"],
    ["table message", debugState.table.message || "-"],
    ["table observationTime", debugState.table.observationTime || "-"],
    ["table generatedAt", debugState.table.generatedAt || "-"],
    ["table error", debugState.table.error || "-"]
  ];

  debugBodyEl.innerHTML = `
    <div class="debug-grid">
      ${lines.map(([k, v]) => `
        <div class="debug-key">${escapeHtml(k)}</div>
        <div class="debug-value">${escapeHtml(v)}</div>
      `).join("")}
    </div>
  `;

  debugDetailsEl.hidden = false;
}

export function buildStatusText({
  observationTime,
  rowCount,
  elementLabel,
  elementDescription,
  extraMessage
}) {
  const parts = [];

  if (observationTime) {
    parts.push(`更新時刻:${formatObservationLabel(observationTime)}`);
  } else if (state.manifestCache?.observationTime || state.manifestCache?.baseTime || state.manifestCache?.updatedAt) {
    const fallbackTime =
      state.manifestCache.observationTime ||
      state.manifestCache.baseTime ||
      state.manifestCache.updatedAt;
    parts.push(`更新時刻:${formatObservationLabel(fallbackTime)}`);
  }

  if (typeof rowCount === "number") {
    parts.push(`地点数:${rowCount}`);
  }
  if (elementLabel) {
    parts.push(`選択中要素:${elementLabel}`);
  }
  if (elementDescription) {
    parts.push(`説明:${elementDescription}`);
  }
  if (extraMessage) {
    parts.push(extraMessage);
  }

  return parts.join(" / ");
}

export function renderTable(tableBody, rows) {
  tableBody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div class="station-name">${escapeHtml(row.stationName || "-")}</div>
      <div class="station-start">${renderDualLine(row.startDate || "-")}</div>
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const rank = row.ranks?.[i];
      const td = document.createElement("td");

      if (rank) {
        const classes = ["rank-cell"];
        if (rank.highlightLive) classes.push("live-in-rank");
        if (rank.highlightWithinYear) classes.push("within-year");
        td.className = classes.join(" ");

        td.innerHTML = `
          <div class="value">${escapeHtml(rank.value ?? "-")}</div>
          <div class="date">${renderDualLine(rank.date || "-")}</div>
        `;
      } else {
        td.className = "rank-cell";
        td.innerHTML = `
          <div class="value">-</div>
          <div class="date">-</div>
        `;
      }

      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }
}

export function renderTableMessage(tableBody, message) {
  tableBody.innerHTML = `
    <tr>
      <td colspan="11">${escapeHtml(message)}</td>
    </tr>
  `;
}

export function renderLiveSummary(liveSummaryEl, items) {
  if (!items || items.length === 0) {
    liveSummaryEl.innerHTML = `
      <div class="live-summary-empty">
        現在、実況で10位以内に入っている項目はありません。
      </div>
    `;
    return;
  }

  const sorted = [...items].sort((a, b) => {
    const oa = LIVE_SUMMARY_ORDER.indexOf(a.elementKey);
    const ob = LIVE_SUMMARY_ORDER.indexOf(b.elementKey);
    if (oa !== ob) return oa - ob;

    const rankA = normalizeRank(a.rank) ?? 9999;
    const rankB = normalizeRank(b.rank) ?? 9999;
    if (rankA !== rankB) return rankA - rankB;

    return String(a.stationName || "").localeCompare(String(b.stationName || ""), "ja");
  });

  const overall = sorted.filter((item) => item.monthLabel === "通年");
  const monthly = sorted.filter((item) => item.monthLabel !== "通年");

  const renderColumn = (title, data) => `
    <div class="live-summary-column">
      <div class="live-summary-column-title">${escapeHtml(title)}</div>
      <div class="live-summary-scroll">
        ${
          data.length === 0
            ? `<div class="live-summary-empty">該当なし</div>`
            : data.map((item) => {
                const itemClass = isTopRankItem(item)
                  ? "live-summary-item live-summary-item-top1"
                  : "live-summary-item live-summary-item-rankin";

                return `
                  <div class="${itemClass}">
                    <div class="live-summary-main">
                      <span>${escapeHtml(String(item.rank ?? "-"))}</span>
                      <span>${escapeHtml(item.stationName || "-")}</span>
                      <span>${escapeHtml(item.elementLabel || "-")}</span>
                    </div>
                    <div class="live-summary-sub">
                      <span>${escapeHtml(String(item.value ?? "-"))}</span>
                      <span>${escapeHtml(item.date || "-")}</span>
                      <span>${escapeHtml(item.monthLabel || "")}</span>
                    </div>
                  </div>
                `;
              }).join("")
        }
      </div>
    </div>
  `;

  liveSummaryEl.innerHTML = `
    <div class="live-summary-grid">
      ${renderColumn("通年", overall)}
      ${renderColumn("当月", monthly)}
    </div>
  `;
}

export function renderLiveSummaryMessage(liveSummaryEl, message) {
  liveSummaryEl.innerHTML = `
    <div class="live-summary-empty">${escapeHtml(message)}</div>
  `;
}

export function renderTopRankAlert(topRankAlertEl, hasTopRank) {
  if (!topRankAlertEl) return;
  topRankAlertEl.hidden = !hasTopRank;
}

export function renderRankInBadge(rankInBadgeEl, hasRankIn) {
  if (!rankInBadgeEl) return;
  rankInBadgeEl.hidden = !hasRankIn;
}
