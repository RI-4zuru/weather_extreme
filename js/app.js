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

const STORAGE_KEYS = {
  region: "weather_extreme:last_region",
  pref: "weather_extreme:last_pref",
  month: "weather_extreme:last_month",
  element: "weather_extreme:last_element",
};

const regionTabs = document.getElementById("regionTabs");
const prefButtons = document.getElementById("prefButtons");
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

let currentRegion = "";
let currentPrefKey = "";
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

function readStorage(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function initControls() {
  currentRegion = getInitialRegion();
  currentPrefKey = getInitialPrefKey(currentRegion);
  currentMonth = getInitialMonth();
  currentElementKey = getInitialElementKey(currentMonth);

  renderRegionTabs();
  renderPrefButtons();
  monthSelect.value = currentMonth;
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
  regionTabs.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-region]");
    if (!button) return;

    const nextRegion = button.dataset.region || "";
    if (!nextRegion || nextRegion === currentRegion) return;

    currentRegion = nextRegion;
    writeStorage(STORAGE_KEYS.region, currentRegion);

    currentPrefKey = getInitialPrefKey(currentRegion);
    writeStorage(STORAGE_KEYS.pref, currentPrefKey);

    renderRegionTabs();
    renderPrefButtons();
    await refresh();
  });

  prefButtons.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-pref-key]");
    if (!button) return;

    const nextPrefKey = button.dataset.prefKey || "";
    if (!nextPrefKey || nextPrefKey === currentPrefKey) return;

    currentPrefKey = nextPrefKey;
    writeStorage(STORAGE_KEYS.pref, currentPrefKey);

    renderPrefButtons();
    await refresh();
  });

  monthSelect.addEventListener("change", async () => {
    currentMonth = monthSelect.value;
    writeStorage(STORAGE_KEYS.month, currentMonth);

    currentElementKey = getInitialElementKey(currentMonth);
    writeStorage(STORAGE_KEYS.element, currentElementKey);

    renderElementButtons();
    await refresh();
  });

  elementPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-element-key]");
    if (!button) return;

    currentElementKey = button.dataset.elementKey || "";
    writeStorage(STORAGE_KEYS.element, currentElementKey);

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

function getRegions() {
  return [...new Set((state.prefectures || []).map((item) => item.region).filter(Boolean))];
}

function getPrefsByRegion(region) {
  return (state.prefectures || []).filter((item) => item.region === region);
}

function getInitialRegion() {
  const regions = getRegions();
  const savedRegion = readStorage(STORAGE_KEYS.region);

  if (savedRegion && regions.includes(savedRegion)) {
    return savedRegion;
  }
  if (regions.includes(DEFAULT_REGION)) {
    return DEFAULT_REGION;
  }
  return regions[0] || "";
}

function getInitialPrefKey(region) {
  const prefList = getPrefsByRegion(region);
  const savedPref = readStorage(STORAGE_KEYS.pref);

  if (savedPref && prefList.some((item) => item.key === savedPref)) {
    return savedPref;
  }
  if (prefList.some((item) => item.key === DEFAULT_PREF)) {
    return DEFAULT_PREF;
  }
  return prefList[0]?.key || "";
}

function getInitialMonth() {
  const savedMonth = readStorage(STORAGE_KEYS.month, DEFAULT_MONTH);
  const allowed = new Set(["all", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  return allowed.has(savedMonth) ? savedMonth : DEFAULT_MONTH;
}

function getCurrentElementList(month = currentMonth) {
  return getElementListByMonth(month, state.elements);
}

function getInitialElementKey(month = currentMonth) {
  const list = getCurrentElementList(month);
  if (!list.length) return "";

  const savedElement = readStorage(STORAGE_KEYS.element);
  if (savedElement && list.some((item) => item.key === savedElement)) {
    return savedElement;
  }

  const defaultKey =
    getDefaultElementKey(month, state.elements) ||
    (month === "all" ? DEFAULT_ANNUAL_ELEMENT : DEFAULT_MONTHLY_ELEMENT);

  return list.some((item) => item.key === defaultKey)
    ? defaultKey
    : list[0].key;
}

function getCurrentPrefMeta() {
  return (state.prefectures || []).find((item) => item.key === currentPrefKey) || null;
}

function getCurrentElementMeta() {
  return getCurrentElementList().find((item) => item.key === currentElementKey) || null;
}

function renderRegionTabs() {
  const regions = getRegions();
  regionTabs.innerHTML = regions
    .map((region) => `
      <button
        type="button"
        class="region-tab ${region === currentRegion ? "active" : ""}"
        data-region="${region}"
      >
        ${region}
      </button>
    `)
    .join("");
}

function renderPrefButtons() {
  const prefList = getPrefsByRegion(currentRegion);
  prefButtons.innerHTML = prefList
    .map((item) => `
      <button
        type="button"
        class="pref-button ${item.key === currentPrefKey ? "active" : ""}"
        data-pref-key="${item.key}"
      >
        ${item.name}
      </button>
    `)
    .join("");
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

  state.debug.selectedRegion = currentRegion;
  state.debug.selectedPrefKey = prefMeta.key;
  state.debug.selectedPrefName = prefMeta.name;
  state.debug.selectedMonth = currentMonth;
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
      loadTable(prefMeta.key, elementMeta.key, currentMonth),
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

    if (isLiveSupported(elementMeta.key, currentMonth) && neededStationCodes.length > 0) {
      try {
        const liveBundle = await buildLiveValuesForStations({
          stationCodes: neededStationCodes,
          elementKey: elementMeta.key,
          month: currentMonth,
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

    const annualSummary = currentMonth === "all"
      ? buildLiveSummaryItems(
          decoratedRows,
          elementMeta.key,
          elementMeta.shortLabel || elementMeta.label || elementMeta.key,
          "all"
        )
      : [];

    const monthlySummary = currentMonth === "all"
      ? []
      : buildLiveSummaryItems(
          decoratedRows,
          elementMeta.key,
          elementMeta.shortLabel || elementMeta.label || elementMeta.key,
          currentMonth
        );

    state.debug.summaryItemCount = annualSummary.length + monthlySummary.length;

    renderTable(rankTableBody, decoratedRows);
    renderLiveSummary(liveSummaryBody, annualSummary, monthlySummary);
    renderStatus({
      tableTitleEl,
      statusTextEl,
      observedLatestAtEl,
      prefName: prefMeta.name,
      month: currentMonth,
      elementKey: elementMeta.key,
      elementLabel: elementMeta.shortLabel || elementMeta.label || elementMeta.key,
      rowCount: rows.length,
      latestObservationTime,
      supportMessage: liveSupportMessage,
    });

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
