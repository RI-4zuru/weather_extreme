import {
  DEFAULT_ANNUAL_ELEMENT,
  DEFAULT_MONTH,
  DEFAULT_MONTHLY_ELEMENT,
  DEFAULT_PREF,
  DEFAULT_REGION,
} from "./constants.js";
import {
  findStationByRowName,
  getDefaultElementKey,
  getElementListByMonth,
  loadElements,
  loadManifest,
  loadPrefectures,
  loadStations,
  loadTable,
} from "./data-loader.js";
import {
  buildLiveValuesForStations,
  isLiveSupported,
} from "./live-source.js";
import {
  buildLiveSummaryItems,
  decorateRowsWithLive,
} from "./ranking.js";
import {
  makeTableHead,
  renderDebug,
  renderElementPanel,
  renderLiveSummary,
  renderStatus,
  renderTable,
} from "./renderers.js";
import { state } from "./state.js";
import { unique } from "./utils.js";

const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const elementPanel = document.getElementById("elementPanel");
const elementPanelToggle = document.getElementById("elementPanelToggle");

const summaryToggle = document.getElementById("summaryToggle");
const liveSummaryBody = document.getElementById("liveSummaryBody");

const rankInBadge = document.getElementById("rankInBadge");
const topRankAlert = document.getElementById("topRankAlert");
const observedLatestAtEl = document.getElementById("observedLatestAt");

const tableTitleEl = document.getElementById("tableTitle");
const statusTextEl = document.getElementById("statusText");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");

const debugGrid = document.getElementById("debugGrid");

let currentElementKey = "";
let currentMonth = DEFAULT_MONTH;

async function main() {
  try {
    await Promise.all([
      loadPrefectures(),
      loadElements(),
      loadManifest(),
    ]);

    makeTableHead(rankTableHead);

    initControls();
    bindEvents();

    await refresh();
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">
          初期化に失敗しました: ${error.message || String(error)}
        </td>
      </tr>
    `;
  }
}

function initControls() {
  populateRegions();
  populatePrefectures(regionSelect.value);

  monthSelect.value = DEFAULT_MONTH;
  currentMonth = monthSelect.value;

  currentElementKey = getInitialElementKey();
  renderElementButtons();

  elementPanel.hidden = true;
  elementPanelToggle.textContent = "要素選択を開く";
  elementPanelToggle.setAttribute("aria-expanded", "false");

  liveSummaryBody.hidden = true;
  summaryToggle.textContent = "開く";
  summaryToggle.setAttribute("aria-expanded", "false");

  rankInBadge.hidden = true;
  topRankAlert.hidden = true;
  observedLatestAtEl.textContent = "読み込み待ち";
}

function bindEvents() {
  regionSelect.addEventListener("change", async () => {
    populatePrefectures(regionSelect.value);
    await refresh();
  });

  prefSelect.addEventListener("change", async () => {
    await refresh();
  });

  monthSelect.addEventListener("change", async () => {
    currentMonth = monthSelect.value;
    currentElementKey = getInitialElementKey();
    renderElementButtons();
    await refresh();
  });

  elementPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-element-key]");
    if (!button) return;

    currentElementKey = button.dataset.elementKey || "";
    renderElementButtons();
    await refresh();
  });

  elementPanelToggle.addEventListener("click", () => {
    const nextHidden = !elementPanel.hidden;
    elementPanel.hidden = nextHidden;
    elementPanelToggle.textContent = nextHidden ? "要素選択を開く" : "要素選択を閉じる";
    elementPanelToggle.setAttribute("aria-expanded", String(!nextHidden));
  });

  summaryToggle.addEventListener("click", () => {
    const nextHidden = !liveSummaryBody.hidden;
    liveSummaryBody.hidden = nextHidden;
    summaryToggle.textContent = nextHidden ? "開く" : "閉じる";
    summaryToggle.setAttribute("aria-expanded", String(!nextHidden));
  });
}

function populateRegions() {
  const regionList = [...new Set((state.prefectures || []).map((item) => item.region).filter(Boolean))];

  regionSelect.innerHTML = regionList
    .map((region) => `<option value="${region}">${region}</option>`)
    .join("");

  if (!regionList.length) {
    regionSelect.innerHTML = `<option value="">地域なし</option>`;
    return;
  }

  if (regionList.includes(DEFAULT_REGION)) {
    regionSelect.value = DEFAULT_REGION;
  } else {
    regionSelect.value = regionList[0];
  }
}

function populatePrefectures(region) {
  const prefList = (state.prefectures || []).filter((item) => item.region === region);

  prefSelect.innerHTML = prefList
    .map((item) => `<option value="${item.key}">${item.name}</option>`)
    .join("");

  if (!prefList.length) {
    prefSelect.innerHTML = `<option value="">都道府県なし</option>`;
    return;
  }

  if (prefList.some((item) => item.key === DEFAULT_PREF)) {
    prefSelect.value = DEFAULT_PREF;
  } else {
    prefSelect.value = prefList[0].key;
  }
}

function getCurrentPrefMeta() {
  return (state.prefectures || []).find((item) => item.key === prefSelect.value) || null;
}

function getCurrentElementList() {
  return getElementListByMonth(monthSelect.value, state.elements);
}

function getCurrentElementMeta() {
  return getCurrentElementList().find((item) => item.key === currentElementKey) || null;
}

function getInitialElementKey() {
  const list = getCurrentElementList();
  if (!list.length) return "";

  const defaultKey =
    getDefaultElementKey(monthSelect.value, state.elements) ||
    (monthSelect.value === "all" ? DEFAULT_ANNUAL_ELEMENT : DEFAULT_MONTHLY_ELEMENT);

  return list.some((item) => item.key === defaultKey)
    ? defaultKey
    : list[0].key;
}

function renderElementButtons() {
  renderElementPanel(elementPanel, getCurrentElementList(), currentElementKey);
}

function pickLatestObservedAt(latestObservationTime, liveValuesByCode) {
  if (latestObservationTime) return latestObservationTime;

  const observedList = Object.values(liveValuesByCode || {})
    .map((item) => item?.observedAt || "")
    .filter(Boolean)
    .sort();

  return observedList.length ? observedList[observedList.length - 1] : "";
}

async function refresh() {
  const prefMeta = getCurrentPrefMeta();
  const elementMeta = getCurrentElementMeta();

  if (!prefMeta || !elementMeta) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">都道府県または要素が未選択です。</td>
      </tr>
    `;
    rankInBadge.hidden = true;
    topRankAlert.hidden = true;
    observedLatestAtEl.textContent = "実況未取得";
    return;
  }

  state.debug.selectedRegion = regionSelect.value;
  state.debug.selectedPrefKey = prefMeta.key;
  state.debug.selectedPrefName = prefMeta.name;
  state.debug.selectedMonth = monthSelect.value;
  state.debug.selectedElementKey = elementMeta.key;
  state.debug.selectedElementLabel = elementMeta.shortLabel || elementMeta.label || elementMeta.key;
  state.debug.pointFetchCount = 0;
  state.debug.liveError = "";

  rankTableBody.innerHTML = `
    <tr>
      <td class="message-cell" colspan="11">読み込み中です…</td>
    </tr>
  `;

  try {
    const [{ index }, tableData] = await Promise.all([
      loadStations(prefMeta.key),
      loadTable(prefMeta.key, elementMeta.key, monthSelect.value),
    ]);

    const rows = tableData.rows || [];
    state.debug.tableRowCount = rows.length;

    const neededStationCodes = unique(
      rows
        .map((row) => findStationByRowName(row.stationName, index)?.code || null)
        .filter(Boolean)
    );

    let liveSupportMode = "unsupported";
    let liveSupportMessage = "この要素の実況判定は未対応です。";
    let latestObservationTime = "";
    let liveValuesByCode = {};

    if (isLiveSupported(elementMeta.key, monthSelect.value) && neededStationCodes.length > 0) {
      try {
        const liveBundle = await buildLiveValuesForStations({
          stationCodes: neededStationCodes,
          elementKey: elementMeta.key,
          month: monthSelect.value,
        });

        latestObservationTime = liveBundle.latestIso || "";
        liveValuesByCode = liveBundle.valuesByCode || {};
        liveSupportMode = liveBundle.support || "supported";
        liveSupportMessage = liveBundle.message || "";
      } catch (error) {
        liveSupportMode = "error";
        liveSupportMessage = "実況取得に失敗したため、極値表のみ表示しています。";
        state.debug.liveError = error.message || String(error);
        liveValuesByCode = {};
        latestObservationTime = "";
      }
    }

    // latestIso が空でも、各地点 observedAt が取れていればそれを採用
    latestObservationTime = pickLatestObservedAt(latestObservationTime, liveValuesByCode);

    state.debug.latestObservationTime = latestObservationTime;
    state.debug.liveSupported = liveSupportMode;

    const decoratedRows = decorateRowsWithLive(
      rows,
      (rowStationName) => findStationByRowName(rowStationName, index),
      liveValuesByCode,
      elementMeta.key,
      liveSupportMode
    );

    const annualSummary = monthSelect.value === "all"
      ? buildLiveSummaryItems(
          decoratedRows,
          elementMeta.key,
          elementMeta.shortLabel || elementMeta.label || elementMeta.key,
          "all"
        )
      : [];

    const monthlySummary = monthSelect.value === "all"
      ? []
      : buildLiveSummaryItems(
          decoratedRows,
          elementMeta.key,
          elementMeta.shortLabel || elementMeta.label || elementMeta.key,
          monthSelect.value
        );

    state.debug.summaryItemCount = annualSummary.length + monthlySummary.length;

    renderTable(rankTableBody, decoratedRows);
    renderLiveSummary(liveSummaryBody, annualSummary, monthlySummary);
    renderStatus({
      tableTitleEl,
      statusTextEl,
      observedLatestAtEl,
      prefName: prefMeta.name,
      month: monthSelect.value,
      elementKey: elementMeta.key,
      elementLabel: elementMeta.shortLabel || elementMeta.label || elementMeta.key,
      rowCount: rows.length,
      latestObservationTime,
      supportMessage: liveSupportMessage,
    });

    // バッジは rows ではなく、実際に表示対象になった summary 件数で判定
    const totalSummaryCount = annualSummary.length + monthlySummary.length;
    const hasTop1Summary =
      annualSummary.some((item) => item.rank === 1) ||
      monthlySummary.some((item) => item.rank === 1);

    rankInBadge.hidden = totalSummaryCount === 0;
    topRankAlert.hidden = !hasTop1Summary;

    renderDebug(debugGrid, state.debug);
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">表示に失敗しました: ${error.message || String(error)}</td>
      </tr>
    `;
    state.debug.liveError = error.message || String(error);
    rankInBadge.hidden = true;
    topRankAlert.hidden = true;
    observedLatestAtEl.textContent = "実況未取得";
    renderDebug(debugGrid, state.debug);
  }
}

main();
