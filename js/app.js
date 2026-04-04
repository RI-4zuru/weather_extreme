import {
  DEFAULT_ELEMENT,
  DEFAULT_MONTH,
  DEFAULT_PREF,
  DEFAULT_REGION,
  ELEMENT_LABELS
} from "./constants.js";
import { loadLiveSummaryData, loadManifest, loadPrefectures, loadTableData } from "./data-loader.js";
import {
  buildStatusText,
  getElementDescription,
  hasAnyRankIn,
  isTopRankItem,
  makeHeader,
  renderDebugPanel,
  renderLiveSummary,
  renderLiveSummaryMessage,
  renderRankInBadge,
  renderTable,
  renderTableMessage,
  renderTopRankAlert
} from "./renderers.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";

const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const liveSummaryEl = document.getElementById("liveSummary");
const liveSummarySectionEl = document.getElementById("liveSummarySection");
const rankInBadgeEl = document.getElementById("rankInBadge");
const debugDetailsEl = document.getElementById("debugDetails");
const debugBodyEl = document.getElementById("debugBody");
const topRankAlertEl = document.getElementById("topRankAlert");

function getSelectedElement() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : DEFAULT_ELEMENT;
}

function getSelectedElementLabel() {
  return ELEMENT_LABELS[getSelectedElement()] || getSelectedElement();
}

function getSelectedPrefMeta() {
  return state.prefecturesData.find((p) => p.key === prefSelect.value) || null;
}

function updateDebugSelections() {
  const prefMeta = getSelectedPrefMeta();

  state.debugState.selectedRegion = regionSelect.value;
  state.debugState.selectedPref = prefSelect.value;
  state.debugState.selectedPrefName = prefMeta?.name || "";
  state.debugState.selectedMonth = monthSelect.value;
  state.debugState.selectedElement = getSelectedElement();
  state.debugState.selectedElementLabel = getSelectedElementLabel();
}

function populatePrefectures() {
  const region = regionSelect.value;
  const list = state.prefecturesData.filter((p) => p.region === region);

  prefSelect.innerHTML = list
    .map((pref) => `<option value="${escapeHtml(pref.key)}">${escapeHtml(pref.name)}</option>`)
    .join("");
}

async function initPrefectures() {
  const prefectures = await loadPrefectures();

  const regions = [...new Set(prefectures.map((p) => p.region))];
  regionSelect.innerHTML = regions
    .map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    .join("");

  if (regions.includes(DEFAULT_REGION)) {
    regionSelect.value = DEFAULT_REGION;
  }

  populatePrefectures();

  if ([...prefSelect.options].some((opt) => opt.value === DEFAULT_PREF)) {
    prefSelect.value = DEFAULT_PREF;
  }

  monthSelect.value = DEFAULT_MONTH;

  const defaultRadio = document.querySelector(`input[name="element"][value="${DEFAULT_ELEMENT}"]`);
  if (defaultRadio) {
    defaultRadio.checked = true;
  }

  updateDebugSelections();
  renderDebugPanel(debugBodyEl, debugDetailsEl);
  renderTopRankAlert(topRankAlertEl, false);
  renderRankInBadge(rankInBadgeEl, false);
}

async function refreshLiveSummary(prefKey) {
  try {
    const data = await loadLiveSummaryData(prefKey);
    const status = data.status || "ok";
    const message = data.message || "";
    const items = Array.isArray(data.items) ? data.items : [];

    if (status === "error") {
      renderLiveSummaryMessage(liveSummaryEl, message || "実況一覧の取得に失敗しました。");
      renderTopRankAlert(topRankAlertEl, false);
      renderRankInBadge(rankInBadgeEl, false);
    } else {
      renderLiveSummary(liveSummaryEl, items);
      const hasTopRank = items.some((item) => isTopRankItem(item));
      const hasRankIn = hasAnyRankIn(items);
      renderTopRankAlert(topRankAlertEl, hasTopRank);
      renderRankInBadge(rankInBadgeEl, hasRankIn);
    }
  } catch (error) {
    console.error(error);
    renderLiveSummaryMessage(liveSummaryEl, "実況一覧の読み込みに失敗しました。");
    renderTopRankAlert(topRankAlertEl, false);
    renderRankInBadge(rankInBadgeEl, false);
  }

  renderDebugPanel(debugBodyEl, debugDetailsEl);
}

async function refreshTable() {
  updateDebugSelections();

  const prefMeta = getSelectedPrefMeta();
  const prefKey = prefSelect.value;
  const elementKey = getSelectedElement();
  const month = monthSelect.value;
  const elementLabel = getSelectedElementLabel();
  const elementDescription = getElementDescription(elementKey);

  try {
    await loadManifest();
  } catch (error) {
    console.error(error);
  }
  renderDebugPanel(debugBodyEl, debugDetailsEl);

  if (!prefMeta) {
    statusEl.textContent = "都道府県情報が見つかりません";
    makeHeader(tableHead);
    renderTableMessage(tableBody, "都道府県情報が見つかりません。");
    renderLiveSummaryMessage(liveSummaryEl, "実況一覧を表示できません。");
    renderTopRankAlert(topRankAlertEl, false);
    renderRankInBadge(rankInBadgeEl, false);
    renderDebugPanel(debugBodyEl, debugDetailsEl);
    return;
  }

  await refreshLiveSummary(prefKey);

  if (!prefMeta.stationsFile) {
    makeHeader(tableHead);
    renderTableMessage(tableBody, "この都道府県は未対応です。");
    statusEl.textContent = buildStatusText({
      rowCount: 0,
      elementLabel,
      elementDescription,
      extraMessage: "未対応"
    });
    renderDebugPanel(debugBodyEl, debugDetailsEl);
    return;
  }

  statusEl.textContent = "読み込み中...";

  try {
    const data = await loadTableData(prefKey, elementKey, month);
    const rows = data.rows || [];
    const status = data.status || "ok";
    const message = data.message || "";
    const observationTime = data.observationTime || data.baseTime || data.updatedAt || "";

    makeHeader(tableHead);

    if (status === "error") {
      renderTableMessage(tableBody, message || "データ取得に失敗しました。");
      statusEl.textContent = buildStatusText({
        observationTime,
        rowCount: 0,
        elementLabel,
        elementDescription,
        extraMessage: message || "データ取得失敗"
      });
    } else if (status === "no_observation") {
      renderTableMessage(tableBody, "この要素は、この県では観測対象がありません。");
      statusEl.textContent = buildStatusText({
        observationTime,
        rowCount: 0,
        elementLabel,
        elementDescription
      });
    } else {
      renderTable(tableBody, rows);
      statusEl.textContent = buildStatusText({
        observationTime,
        rowCount: rows.length,
        elementLabel,
        elementDescription
      });
    }
  } catch (error) {
    console.error(error);

    makeHeader(tableHead);
    renderTableMessage(tableBody, "JSONの読み込みに失敗しました。");

    statusEl.textContent = buildStatusText({
      observationTime:
        state.manifestCache?.observationTime ||
        state.manifestCache?.baseTime ||
        state.manifestCache?.updatedAt ||
        "",
      rowCount: 0,
      elementLabel,
      elementDescription,
      extraMessage: "JSONの読み込みに失敗しました"
    });
  }

  renderDebugPanel(debugBodyEl, debugDetailsEl);
}

function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  state.refreshTimer = setInterval(() => {
    refreshTable().catch((error) => {
      console.error(error);
    });
  }, 10 * 60 * 1000);
}

function setupTopRankAlertJump() {
  if (!topRankAlertEl || !liveSummarySectionEl) return;

  topRankAlertEl.addEventListener("click", () => {
    if (!liveSummarySectionEl.open) {
      liveSummarySectionEl.open = true;
    }
    liveSummarySectionEl.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

async function init() {
  makeHeader(tableHead);
  await initPrefectures();
  setupTopRankAlertJump();

  regionSelect.addEventListener("change", async () => {
    populatePrefectures();
    updateDebugSelections();
    renderDebugPanel(debugBodyEl, debugDetailsEl);
    await refreshTable();
  });

  prefSelect.addEventListener("change", refreshTable);
  monthSelect.addEventListener("change", refreshTable);

  document.querySelectorAll('input[name="element"]').forEach((el) => {
    el.addEventListener("change", refreshTable);
  });

  await refreshTable();
  startAutoRefresh();
}

init().catch((error) => {
  console.error(error);
  statusEl.textContent = `初期化に失敗しました: ${error?.message || error}`;
  renderTopRankAlert(topRankAlertEl, false);
  renderRankInBadge(rankInBadgeEl, false);
});
