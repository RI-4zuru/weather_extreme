import { escapeHtml, formatObservationLabel, renderDualLine } from "./utils.js";

export function makeTableHead(tableHead) {
  const headers = [];
  headers.push(`
    <th class="rank-head-station">
      <span class="rank-head-station-main">地点名</span>
      <span class="rank-head-station-sub">観測開始</span>
    </th>
  `);

  for (let i = 1; i <= 10; i += 1) {
    headers.push(`<th>${i}位</th>`);
  }

  tableHead.innerHTML = `<tr>${headers.join("")}</tr>`;
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
              title="${escapeHtml(item.label || item.shortLabel || item.key)}"
            >
              ${escapeHtml(item.shortLabel || item.label || item.key)}
            </button>
          `).join("")}
        </div>
      </section>
    `)
    .join("");
}

export function renderTable(tableBody, rows) {
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
    const showLiveBadge =
      live.supported &&
      Number.isFinite(live.value) &&
      Number.isFinite(liveRank) &&
      liveRank >= 1 &&
      liveRank <= 10;

    const liveStationLine =
      row.isPrefectureAggregate && live.stationName
        ? `地点: ${escapeHtml(String(live.stationName))}<br>`
        : "";

    const stationLiveBadge = showLiveBadge
      ? `
        <span class="station-live-badge ${liveRank === 1 ? "top1" : ""}">
          実況: ${escapeHtml(String(liveRank))}位相当<br>
          ${liveStationLine}
          値: ${escapeHtml(String(live.value))}<br>
          ${escapeHtml(formatObservationLabel(live.observedAt))}
        </span>
      `
      : "";

    const cells = [];
    for (let i = 0; i < 10; i += 1) {
      const rankItem = row.ranks?.[i];
      if (!rankItem) {
        cells.push(`
          <td class="rank-cell">
            <span class="rank-value">-</span>
            <span class="rank-station">-</span>
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

      const stationLine = rankItem.stationName
        ? `<span class="rank-station">${escapeHtml(String(rankItem.stationName))}</span>`
        : "";

      cells.push(`
        <td class="${cellClass}">
          <span class="rank-value">${escapeHtml(String(rankItem.value ?? "-"))}</span>
          ${stationLine}
          <span class="rank-date">${renderDualLine(rankItem.date || "-")}</span>
        </td>
      `);
    }

    const stationColClass = row.isPrefectureAggregate
      ? "station-col prefecture-aggregate-col"
      : "station-col";

    return `
      <tr class="${row.isPrefectureAggregate ? "prefecture-aggregate-row" : ""}">
        <td class="${stationColClass}">
          <span class="station-name">${escapeHtml(row.stationName || "-")}</span>
          <span class="start-date">${renderDualLine(row.startDate || "-")}</span>
          ${stationLiveBadge}
        </td>
        ${cells.join("")}
      </tr>
    `;
  }).join("");
}

function renderSummaryList(items) {
  if (!items.length) {
    return `<div class="empty-message">該当なし</div>`;
  }

  return items.map((item) => `
    <div class="live-summary-item ${item.top1 ? "top1" : ""}">
      <span class="rank">${escapeHtml(String(item.rank))}位</span>
      ${escapeHtml(item.stationName)} / ${escapeHtml(item.elementLabel)} / ${escapeHtml(String(item.value))}
      <span class="meta">${escapeHtml(formatObservationLabel(item.observedAt))}</span>
    </div>
  `).join("");
}

export function renderLiveSummary(liveSummaryBody, annualItems, monthlyItems) {
  const annualBody = liveSummaryBody.querySelector('[data-summary-body="annual"] .live-summary-column-body');
  const monthlyBody = liveSummaryBody.querySelector('[data-summary-body="monthly"] .live-summary-column-body');

  if (annualBody) {
    annualBody.innerHTML = renderSummaryList(annualItems);
  }
  if (monthlyBody) {
    monthlyBody.innerHTML = renderSummaryList(monthlyItems);
  }
}

export function renderStatus({
  tableTitleEl,
  statusTextEl,
  observedLatestAtEl,
  prefName,
  month,
  elementLabel,
  rowCount,
  latestObservationTime,
}) {
  tableTitleEl.textContent = `${prefName}/${month === "all" ? "通年" : `${month}月`}/${elementLabel}`;
  observedLatestAtEl.textContent = latestObservationTime
    ? formatObservationLabel(latestObservationTime)
    : "実況未取得";

  statusTextEl.textContent = `地点数: ${rowCount} / 要素: ${elementLabel}`;
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
