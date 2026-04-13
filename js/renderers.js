import { ELEMENT_DESCRIPTIONS, LIVE_SUPPORT_MODE_LABELS } from "./constants.js";
import { escapeHtml, formatObservationLabel, renderDualLine } from "./utils.js";

export function makeTableHead(tableHead) {
  const headers = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i += 1) {
    headers.push(`${i}位`);
  }

  tableHead.innerHTML = `
    <tr>
      ${headers.map((label) => `<th>${escapeHtml(label)}</th>`).join("")}
    </tr>
  `;
}

export function renderElementPanel(elementPanel, elementList, selectedKey) {
  if (!elementList.length) {
    elementPanel.innerHTML = `<div class="empty-message">要素定義がありません。</div>`;
    return;
  }

  const grouped = new Map();
  for (const item of elementList) {
    const group = item.group || "その他";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(item);
  }

  elementPanel.innerHTML = [...grouped.entries()]
    .map(([groupName, items]) => `
      <section class="element-group">
        <h3 class="element-group-title">${escapeHtml(groupName)}</h3>
        <div class="element-button-grid">
          ${items.map((item) => `
            <button
              type="button"
              class="element-button ${item.key === selectedKey ? "active" : ""}"
              data-element-key="${escapeHtml(item.key)}"
            >
              ${escapeHtml(item.shortLabel || item.label || item.key)}
            </button>
          `).join("")}
        </div>
      </section>
    `)
    .join("");
}

export function renderTable(tableBody, rows, elementKey) {
  if (!rows.length) {
    tableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">該当データがありません。</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = rows.map((row) => {
    const live = row.liveCandidate || {};
    const liveRank = live.rank;
    const showLiveBadge = live.supported && Number.isFinite(live.value) && Number.isFinite(liveRank);

    const stationLiveBadge = showLiveBadge
      ? `
        <span class="station-live-badge ${liveRank === 1 ? "top1" : ""}">
          実況: ${escapeHtml(String(liveRank))}位相当<br>
          値: ${escapeHtml(String(live.value))}<br>
          ${escapeHtml(formatObservationLabel(live.observedAt))}
        </span>
      `
      : live.supported === false
        ? `<span class="station-live-badge unsupported">実況判定未対応</span>`
        : live.error
          ? `<span class="station-live-badge unsupported">実況取得失敗</span>`
          : "";

    const cells = [];
    for (let i = 0; i < 10; i += 1) {
      const rankItem = row.ranks?.[i];
      if (!rankItem) {
        cells.push(`
          <td class="rank-cell">
            <span class="rank-value">-</span>
            <span class="rank-date">-</span>
          </td>
        `);
        continue;
      }

      const isLiveTarget = liveRank === i + 1;
      const isWithinYear = !!rankItem.highlightWithinYear;

      let cellClass = "rank-cell";
      if (isLiveTarget && isWithinYear) {
        cellClass += " live-and-year";
      } else if (isLiveTarget) {
        cellClass += " live-target";
      } else if (isWithinYear) {
        cellClass += " within-year";
      }

      cells.push(`
        <td class="${cellClass}">
          <span class="rank-value">${escapeHtml(String(rankItem.value ?? "-"))}</span>
          <span class="rank-date">${renderDualLine(rankItem.date || "-")}</span>
        </td>
      `);
    }

    return `
      <tr>
        <td class="station-col">
          <span class="station-name">${escapeHtml(row.stationName || "-")}</span>
          <span class="start-date">${renderDualLine(row.startDate || "-")}</span>
          ${stationLiveBadge}
        </td>
        ${cells.join("")}
      </tr>
    `;
  }).join("");
}

export function renderLiveSummary(liveSummaryBody, annualItems, monthlyItems) {
  const renderColumn = (title, items) => `
    <div class="live-summary-column">
      <h3>${escapeHtml(title)}</h3>
      ${
        items.length === 0
          ? `<div class="empty-message">該当なし</div>`
          : `
            <div class="live-summary-list">
              ${items.map((item) => `
                <div class="live-summary-item ${item.top1 ? "top1" : ""}">
                  <span class="rank">${escapeHtml(String(item.rank))}位</span>
                  ${escapeHtml(item.stationName)} / ${escapeHtml(item.elementLabel)} / ${escapeHtml(String(item.value))}
                  <span class="meta">${escapeHtml(formatObservationLabel(item.observedAt))}</span>
                </div>
              `).join("")}
            </div>
          `
      }
    </div>
  `;

  liveSummaryBody.innerHTML = `
    ${renderColumn("通年", annualItems)}
    ${renderColumn("当月", monthlyItems)}
  `;
}

export function renderStatus({
  tableTitleEl,
  statusTextEl,
  observedLatestAtEl,
  liveSupportBadgeEl,
  prefName,
  month,
  elementKey,
  elementLabel,
  rowCount,
  latestObservationTime,
  liveSupportMode,
  supportMessage,
}) {
  tableTitleEl.textContent = `${prefName}/${month === "all" ? "通年" : `${month}月`}/${elementLabel}`;
  observedLatestAtEl.textContent = latestObservationTime
    ? formatObservationLabel(latestObservationTime)
    : "実況未取得";

  const parts = [];
  parts.push(`地点数: ${rowCount}`);
  parts.push(`要素: ${elementLabel}`);

  const description = ELEMENT_DESCRIPTIONS[elementKey] || "";
  if (description) {
    parts.push(description);
  }
  if (supportMessage) {
    parts.push(supportMessage);
  }

  statusTextEl.textContent = parts.join(" / ");
  liveSupportBadgeEl.textContent = LIVE_SUPPORT_MODE_LABELS[liveSupportMode] || "実況判定: 不明";
}

export function renderDebug(debugGrid, debug) {
  const entries = [
    ["地域", debug.selectedRegion],
    ["都道府県", `${debug.selectedPrefName} (${debug.selectedPrefKey})`],
    ["月", debug.selectedMonth],
    ["要素", `${debug.selectedElementLabel} (${debug.selectedElementKey})`],
    ["stations path", debug.stationsPath],
    ["table path", debug.tablePath],
    ["table rowCount", String(debug.tableRowCount)],
    ["latest observation", debug.latestObservationTime || "-"],
    ["point fetch count", String(debug.pointFetchCount)],
    ["summary item count", String(debug.summaryItemCount)],
    ["live support", debug.liveSupported || "-"],
    ["live error", debug.liveError || "-"],
  ];

  debugGrid.innerHTML = entries
    .map(([key, value]) => `
      <div class="debug-key">${escapeHtml(key)}</div>
      <div class="debug-value">${escapeHtml(value || "-")}</div>
    `)
    .join("");
}
