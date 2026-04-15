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
  hasAnyRankIn,
  hasAnyTop1,
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

const rankInBadge = document.getElementById("rankInBadge");
const topRankAlert = document.getElementById("topRankAlert");
const liveSupportBadge = document.getElementById("liveSupportBadge");
const observedLatestAtEl = document.getElementById("observedLatestAt");

const tableTitleEl = document.getElementById("tableTitle");
const statusTextEl = document.getElementById("statusText");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");

const liveSummaryBody = document.getElementById("liveSummaryBody");
const debugGrid = document.getElementById("debugGrid");

let currentMonth = DEFAULT_MONTH;
let currentElementKey = "";

async function main() {
  try {
    await Promise.all([loadPrefectures(), loadElements(), loadManifest()]);
    makeTableHead(rankTableHead);
    initControls();
    bindEvents();
    await refresh();
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">初期化に失敗しました: ${error.message || String(error)}</td>
      </tr>
    `;
  }
}

function initControls() {
  populateRegions();
  populatePrefectures();
  monthSelect.value = DEFAULT_MONTH;
  currentMonth = monthSelect.value;
  currentElementKey = getInitialElementKey();
  renderElementButtons();
}

function bindEvents() {
  regionSelect.addEventListener("change", async () => {
    populatePrefectures();
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
    elementPanelToggle.setAttribute("aria-expanded", String(!nextHidden));
  });
}

function populateRegions() {
  const regions = [...new Set(state.prefectures.map((item) => item.region))];
  regionSelect.innerHTML = regions
    .map((region) => `<option value="${region}">${region}</option>`)
    .join("");
  regionSelect.value = regions.includes(DEFAULT_REGION) ? DEFAULT_REGION : (regions[0] || "");
}

function populatePrefectures() {
  const region = regionSelect.value;
  const list = state.prefectures.filter((item) => item.region === region);
  prefSelect.innerHTML = list
    .map((item) => `<option value="${item.key}">${item.name}</option>`)
    .join("");

  const hasDefault = list.some((item) => item.key === DEFAULT_PREF);
  prefSelect.value = hasDefault ? DEFAULT_PREF : (list[0]?.key || "");
}

function getCurrentPrefMeta() {
  return state.prefectures.find((item) => item.key === prefSelect.value) || null;
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

async function refresh() {
  const prefMeta = getCurrentPrefMeta();
  const elementMeta = getCurrentElementMeta();

  if (!prefMeta || !elementMeta) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">都道府県または要素が未選択です。</td>
      </tr>
    `;
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
    const [{ stations, index }, tableData] = await Promise.all([
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

    if (isLiveSupported(elementMeta.key, monthSelect.value)) {
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
      }
    }

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

    renderTable(rankTableBody, decoratedRows, elementMeta.key);
    renderLiveSummary(liveSummaryBody, annualSummary, monthlySummary);
    renderStatus({
      tableTitleEl,
      statusTextEl,
      observedLatestAtEl,
      liveSupportBadgeEl: liveSupportBadge,
      prefName: prefMeta.name,
      month: monthSelect.value,
      elementKey: elementMeta.key,
      elementLabel: elementMeta.shortLabel || elementMeta.label || elementMeta.key,
      rowCount: rows.length,
      latestObservationTime,
      liveSupportMode,
      supportMessage: liveSupportMessage,
    });

    rankInBadge.hidden = !hasAnyRankIn(decoratedRows);
    topRankAlert.hidden = !hasAnyTop1(decoratedRows);

    renderDebug(debugGrid, state.debug);
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="11">表示に失敗しました: ${error.message || String(error)}</td>
      </tr>
    `;
    state.debug.liveError = error.message || String(error);
    renderDebug(debugGrid, state.debug);
  }
}

main();
