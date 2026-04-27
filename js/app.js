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
  applyHighlightModeToRows,
  buildAreaAggregateRow,
  buildLiveSummaryItems,
  buildPrefectureAggregateRow,
  decorateRowsWithLive,
  insertLiveIntoRankRows,
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
  enabledPrefs: "weather_extreme:enabled_prefs",
  withinMode: "weather_extreme:within_mode",
  showLiveColumn: "weather_extreme:show_live_column",
  liveValueCache: "weather_extreme:live_value_cache",
  controlPanelCollapsed: "weather_extreme:control_panel_collapsed",
  areaSelection: "weather_extreme:area_selection",
  enabledAreas: "weather_extreme:enabled_areas",
  nationModeEnabled: "weather_extreme:nation_mode_enabled",
};

const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;
const LIVE_CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const WITHIN_HIGHLIGHT_MODES = ["rolling-year", "current-year", "current-month"];

const STANDARD_REGIONS = [
  "北海道",
  "東北",
  "関東甲信",
  "北陸",
  "東海",
  "近畿",
  "中国",
  "四国",
  "九州北部",
  "九州南部・奄美",
  "沖縄",
];

const REGION_PREF_ORDER = {
  "北海道": ["北海道"],
  "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  "関東甲信": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "山梨県", "長野県"],
  "北陸": ["新潟県", "富山県", "石川県", "福井県"],
  "東海": ["岐阜県", "静岡県", "愛知県", "三重県"],
  "近畿": ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  "中国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  "四国": ["徳島県", "香川県", "愛媛県", "高知県"],
  "九州北部": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県"],
  "九州南部・奄美": ["宮崎県", "鹿児島県"],
  "沖縄": ["沖縄県"],
};

const PREF_TO_REGION = Object.fromEntries(
  Object.entries(REGION_PREF_ORDER).flatMap(([region, prefs]) => prefs.map((name) => [name, region]))
);

const ALL_PREF_ORDER = STANDARD_REGIONS.flatMap((region) => REGION_PREF_ORDER[region]);

const regionTabs = document.getElementById("regionTabs");
const prefButtons = document.getElementById("prefButtons");
const monthSelect = document.getElementById("monthSelect");
const elementPanel = document.getElementById("elementPanel");
const elementPanelToggle = document.getElementById("elementPanelToggle");

const controlPanelToggle = document.getElementById("controlPanelToggle");
const controlPanelBody = document.getElementById("controlPanelBody");

const summaryHeader = document.getElementById("summaryHeader");
const summaryChevron = document.getElementById("summaryChevron");
const liveSummaryBody = document.getElementById("liveSummaryBody");

const rankInBadge = document.getElementById("rankInBadge");
const topRankAlert = document.getElementById("topRankAlert");
const observedLatestAtEl = document.getElementById("observedLatestAt");
const withinChip = document.getElementById("withinChip");
const liveColumnToggle = document.getElementById("liveColumnToggle");

const tableTitleEl = document.getElementById("tableTitle");
const statusTextEl = document.getElementById("statusText");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");
const debugGrid = document.getElementById("debugGrid");

const customizeButton = document.getElementById("customizeButton");
const customModal = document.getElementById("customModal");
const customCloseButton = document.getElementById("customCloseButton");
const customCancelButton = document.getElementById("customCancelButton");
const customSaveButton = document.getElementById("customSaveButton");
const customRegionList = document.getElementById("customRegionList");
const selectAllPrefsButton = document.getElementById("selectAllPrefsButton");
const clearAllPrefsButton = document.getElementById("clearAllPrefsButton");

let currentRegion = "";
let currentPrefKey = "";
let currentElementKey = "";
let currentMonth = DEFAULT_MONTH;

let enabledPrefKeys = new Set();
let customExpandedRegions = new Set();
let defaultPrefOrderKeys = [];
let withinHighlightMode = "rolling-year";
let showLiveColumn = false;
let controlPanelCollapsed = false;

let currentSelectionType = "prefecture"; // prefecture / region / nation
let enabledAreaKeys = new Set();
let nationModeEnabled = false;

/**
 * {
 *   "<elementKey>|<month>|<stationCode>": {
 *      value: number,
 *      observedAt: string,
 *      cachedAt: number
 *   }
 * }
 */
let liveValueCache = {};

async function main() {
  try {
    await Promise.all([
      loadPrefectures(),
      loadElements(),
      loadManifest(),
    ]);

    normalizePrefectureRegions();
    defaultPrefOrderKeys = buildDefaultPrefOrderKeys();
    loadLiveValueCache();

    makeTableHead(rankTableHead, false);

    initControls();
    bindEvents();

    await refresh();
    startAutoRefresh();
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(false)}">
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

function normalizePrefectureRegions() {
  state.prefectures = (state.prefectures || []).map((item) => {
    const inferredRegion = PREF_TO_REGION[item.name] || item.region || "";
    return {
      ...item,
      region: inferredRegion,
    };
  });
}

function getAllPrefKeys() {
  return (state.prefectures || []).map((item) => item.key);
}

function getPrefMetaByKey(prefKey) {
  return (state.prefectures || []).find((item) => item.key === prefKey) || null;
}

function getPrefMetaByName(prefName) {
  return (state.prefectures || []).find((item) => item.name === prefName) || null;
}

function buildDefaultPrefOrderKeys() {
  const result = [];
  const used = new Set();

  for (const prefName of ALL_PREF_ORDER) {
    const prefMeta = getPrefMetaByName(prefName);
    if (prefMeta) {
      result.push(prefMeta.key);
      used.add(prefMeta.key);
    }
  }

  for (const item of state.prefectures || []) {
    if (!used.has(item.key)) {
      result.push(item.key);
      used.add(item.key);
    }
  }

  return result;
}

function loadEnabledPrefKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.enabledPrefs);
    if (!raw) {
      enabledPrefKeys = new Set(getAllPrefKeys());
      return;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      enabledPrefKeys = new Set(getAllPrefKeys());
      return;
    }

    const validSet = new Set(getAllPrefKeys());
    enabledPrefKeys = new Set(parsed.filter((key) => validSet.has(key)));

    if (enabledPrefKeys.size === 0) {
      enabledPrefKeys = new Set(getAllPrefKeys());
    }
  } catch {
    enabledPrefKeys = new Set(getAllPrefKeys());
  }
}

function saveEnabledPrefKeys() {
  writeStorage(STORAGE_KEYS.enabledPrefs, JSON.stringify([...enabledPrefKeys]));
}

function loadLiveValueCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.liveValueCache);
    if (!raw) {
      liveValueCache = {};
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      liveValueCache = {};
      return;
    }

    const now = Date.now();
    const next = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") continue;
      if (!Number.isFinite(value.value)) continue;
      if (!value.observedAt) continue;
      if (!Number.isFinite(value.cachedAt)) continue;
      if (now - value.cachedAt > LIVE_CACHE_MAX_AGE_MS) continue;
      next[key] = value;
    }

    liveValueCache = next;
  } catch {
    liveValueCache = {};
  }
}

function saveLiveValueCache() {
  writeStorage(STORAGE_KEYS.liveValueCache, JSON.stringify(liveValueCache));
}

function makeLiveCacheKey(elementKey, month, stationCode) {
  return `${elementKey}|${month}|${stationCode}`;
}

function updateLiveValueCache(valuesByCode, elementKey, month) {
  const now = Date.now();
  for (const [stationCode, value] of Object.entries(valuesByCode || {})) {
    if (!value || !Number.isFinite(value.value) || !value.observedAt) continue;
    liveValueCache[makeLiveCacheKey(elementKey, month, stationCode)] = {
      value: value.value,
      observedAt: value.observedAt,
      cachedAt: now,
    };
  }
  saveLiveValueCache();
}

function mergeLiveValuesWithCache(stationCodes, liveValuesByCode, elementKey, month) {
  const merged = { ...(liveValuesByCode || {}) };
  const now = Date.now();

  for (const stationCode of stationCodes || []) {
    const current = merged[stationCode];
    if (current && Number.isFinite(current.value) && current.observedAt) {
      continue;
    }

    const cached = liveValueCache[makeLiveCacheKey(elementKey, month, stationCode)];
    if (!cached) continue;
    if (now - cached.cachedAt > LIVE_CACHE_MAX_AGE_MS) continue;

    merged[stationCode] = {
      ...(current || {}),
      value: cached.value,
      observedAt: cached.observedAt,
      fromCache: true,
    };
  }

  return merged;
}

function isCurrentSelectionLiveSupported() {
  const elementMeta = getCurrentElementMeta();
  if (!elementMeta) return false;
  return isLiveSupported(elementMeta.key, currentMonth);
}

function syncLiveColumnAvailability(forceOff = false) {
  const supported = isCurrentSelectionLiveSupported();

  if (!supported || forceOff) {
    showLiveColumn = false;
  }

  if (liveColumnToggle) {
    liveColumnToggle.hidden = !supported;
  }

  updateLiveColumnToggleLabel();
  makeTableHead(rankTableHead, supported && showLiveColumn);
}

function getInitialWithinHighlightMode() {
  const saved = readStorage(STORAGE_KEYS.withinMode, "rolling-year");
  return WITHIN_HIGHLIGHT_MODES.includes(saved) ? saved : "rolling-year";
}

function getInitialShowLiveColumn() {
  return readStorage(STORAGE_KEYS.showLiveColumn, "false") === "true";
}

function getInitialControlPanelCollapsed() {
  const saved = readStorage(STORAGE_KEYS.controlPanelCollapsed, "");
  if (saved === "true") return true;
  if (saved === "false") return false;
  return window.matchMedia("(max-width: 900px)").matches;
}

function updateWithinChipLabel() {
  if (!withinChip) return;

  if (withinHighlightMode === "current-year") {
    withinChip.textContent = "黄系：今年の記録";
    return;
  }

  if (withinHighlightMode === "current-month") {
    withinChip.textContent = "黄系：当月の記録";
    return;
  }

  withinChip.textContent = "黄系：1年以内の記録";
}

function updateLiveColumnToggleLabel() {
  if (!liveColumnToggle) return;
  liveColumnToggle.textContent = showLiveColumn ? "実況を表から隠す" : "実況を表に出す";
  liveColumnToggle.setAttribute("aria-pressed", String(showLiveColumn));
  liveColumnToggle.classList.toggle("is-on", showLiveColumn);
}

function updateControlPanelToggleLabel() {
  if (!controlPanelToggle || !controlPanelBody) return;
  controlPanelBody.hidden = controlPanelCollapsed;
  controlPanelToggle.setAttribute("aria-expanded", String(!controlPanelCollapsed));
  controlPanelToggle.textContent = controlPanelCollapsed
    ? "地域・都道府県選択 / 月選択を開く"
    : "地域・都道府県選択 / 月選択を閉じる";
}

function cycleWithinHighlightMode() {
  const currentIndex = WITHIN_HIGHLIGHT_MODES.indexOf(withinHighlightMode);
  const nextIndex = (currentIndex + 1) % WITHIN_HIGHLIGHT_MODES.length;
  withinHighlightMode = WITHIN_HIGHLIGHT_MODES[nextIndex];
  writeStorage(STORAGE_KEYS.withinMode, withinHighlightMode);
  updateWithinChipLabel();
}

function getTotalTableColspan(showLive = showLiveColumn) {
  return showLive ? 12 : 11;
}

function initControls() {
  loadEnabledPrefKeys();
  loadEnabledAreaKeys();
  loadNationModeEnabled();

  currentRegion = getInitialRegion();
  currentPrefKey = getInitialPrefKey(currentRegion);
  currentMonth = getInitialMonth();
  currentElementKey = getInitialElementKey(currentMonth);
  withinHighlightMode = getInitialWithinHighlightMode();
  showLiveColumn = getInitialShowLiveColumn();
  controlPanelCollapsed = getInitialControlPanelCollapsed();

  const savedAreaSelection = readStorage(STORAGE_KEYS.areaSelection, "prefecture");

  if (savedAreaSelection === "nation" && isNationAreaEnabled()) {
    currentSelectionType = "nation";
  } else if (
    savedAreaSelection.startsWith("region:") &&
    enabledAreaKeys.has(savedAreaSelection)
  ) {
    currentSelectionType = "region";
    currentRegion = getRegionFromAreaKey(savedAreaSelection);
  } else {
    currentSelectionType = "prefecture";
  }

  monthSelect.value = currentMonth;
  updateWithinChipLabel();
  updateControlPanelToggleLabel();

  ensureCurrentRegionAndPref();
  renderRegionTabs();
  renderPrefButtons();
  renderElementButtons();
  syncLiveColumnAvailability();

  elementPanel.hidden = true;
  elementPanelToggle.textContent = "要素選択を開く";
  elementPanelToggle.setAttribute("aria-expanded", "false");

  setSummaryExpanded(false);
  setSummaryPanelExpanded("annual", true);
  setSummaryPanelExpanded("monthly", true);

  rankInBadge.hidden = true;
  topRankAlert.hidden = true;
  observedLatestAtEl.textContent = "読み込み待ち";

  if (currentRegion) {
    customExpandedRegions = new Set([currentRegion]);
  }
}

function bindEvents() {
  if (controlPanelToggle) {
    controlPanelToggle.addEventListener("click", () => {
      controlPanelCollapsed = !controlPanelCollapsed;
      writeStorage(STORAGE_KEYS.controlPanelCollapsed, String(controlPanelCollapsed));
      updateControlPanelToggleLabel();
    });
  }

  regionTabs.addEventListener("click", async (event) => {
  const nationButton = event.target.closest("[data-nation-tab]");
  if (nationButton) {
    currentSelectionType = "nation";
    writeStorage(STORAGE_KEYS.areaSelection, "nation");

    renderRegionTabs();
    renderPrefButtons();
    syncLiveColumnAvailability();
    await refresh();
    return;
  }

  const button = event.target.closest("[data-region-tab]");
  if (!button) return;

  const nextRegion = button.dataset.regionTab || "";
  if (!nextRegion) return;

  currentRegion = nextRegion;

  if (currentSelectionType === "nation") {
    currentSelectionType = isRegionAreaEnabled(currentRegion) ? "region" : "prefecture";
  }

  ensureCurrentRegionAndPref();

  if (currentSelectionType === "region") {
    writeStorage(STORAGE_KEYS.areaSelection, makeRegionAreaKey(currentRegion));
  } else {
    writeStorage(STORAGE_KEYS.areaSelection, "prefecture");
    writeStorage(STORAGE_KEYS.pref, currentPrefKey);
  }

  writeStorage(STORAGE_KEYS.region, currentRegion);

  renderRegionTabs();
  renderPrefButtons();
  syncLiveColumnAvailability();
  await refresh();
});

  prefButtons.addEventListener("click", async (event) => {
  const nationSelect = event.target.closest("[data-nation-select]");
  if (nationSelect) {
    currentSelectionType = "nation";
    writeStorage(STORAGE_KEYS.areaSelection, "nation");

    renderRegionTabs();
    renderPrefButtons();
    syncLiveColumnAvailability();
    await refresh();
    return;
  }

  const regionAreaButton = event.target.closest("[data-region-area-select]");
  if (regionAreaButton) {
    const region = regionAreaButton.dataset.regionAreaSelect || "";
    if (!region) return;

    currentSelectionType = "region";
    currentRegion = region;

    writeStorage(STORAGE_KEYS.region, currentRegion);
    writeStorage(STORAGE_KEYS.areaSelection, makeRegionAreaKey(currentRegion));

    renderRegionTabs();
    renderPrefButtons();
    syncLiveColumnAvailability();
    await refresh();
    return;
  }

  const button = event.target.closest("[data-pref-key]");
  if (!button) return;

  const nextPrefKey = button.dataset.prefKey || "";
  if (!nextPrefKey) return;

  currentSelectionType = "prefecture";
  currentPrefKey = nextPrefKey;

  const prefMeta = getPrefMetaByKey(currentPrefKey);
  if (prefMeta?.region) {
    currentRegion = prefMeta.region;
    writeStorage(STORAGE_KEYS.region, currentRegion);
  }

  writeStorage(STORAGE_KEYS.areaSelection, "prefecture");
  writeStorage(STORAGE_KEYS.pref, currentPrefKey);

  renderRegionTabs();
  renderPrefButtons();
  syncLiveColumnAvailability();
  await refresh();
});

  monthSelect.addEventListener("change", async () => {
    currentMonth = monthSelect.value;
    writeStorage(STORAGE_KEYS.month, currentMonth);

    currentElementKey = getInitialElementKey(currentMonth);
    writeStorage(STORAGE_KEYS.element, currentElementKey);

    renderElementButtons();
    syncLiveColumnAvailability();
    await refresh();
  });

  elementPanel.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-element-key]");
    if (!button) return;

    currentElementKey = button.dataset.elementKey || "";
    writeStorage(STORAGE_KEYS.element, currentElementKey);

    renderElementButtons();
    syncLiveColumnAvailability();
    await refresh();
  });

  elementPanelToggle.addEventListener("click", () => {
    const nextHidden = !elementPanel.hidden;
    elementPanel.hidden = nextHidden;
    elementPanelToggle.textContent = nextHidden ? "要素選択を開く" : "要素選択を閉じる";
    elementPanelToggle.setAttribute("aria-expanded", String(!nextHidden));
  });

  summaryHeader.addEventListener("click", () => {
    setSummaryExpanded(liveSummaryBody.hidden);
  });

  summaryHeader.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSummaryExpanded(liveSummaryBody.hidden);
    }
  });

  liveSummaryBody.addEventListener("click", async (event) => {
  const jumpButton = event.target.closest("[data-summary-jump]");
  if (jumpButton) {
    const nextElementKey = jumpButton.dataset.elementKey || "";
    const nextMonth = jumpButton.dataset.month || "all";

    if (nextMonth && nextMonth !== currentMonth) {
      currentMonth = nextMonth;
      monthSelect.value = currentMonth;
      writeStorage(STORAGE_KEYS.month, currentMonth);
    }

    if (nextElementKey && nextElementKey !== currentElementKey) {
      currentElementKey = nextElementKey;
      writeStorage(STORAGE_KEYS.element, currentElementKey);
    }

    renderElementButtons();
    syncLiveColumnAvailability();
    await refresh();

    document.querySelector(".table-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    return;
  }

  const toggle = event.target.closest("[data-summary-toggle]");
  if (!toggle) return;

  const panelKey = toggle.dataset.summaryToggle;
  const body = document.querySelector(`[data-summary-body="${panelKey}"]`);
  if (!body) return;

  setSummaryPanelExpanded(panelKey, body.hidden);
});
  liveSummaryBody.addEventListener("keydown", async (event) => {
  const jumpButton = event.target.closest("[data-summary-jump]");
  if (jumpButton && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    jumpButton.click();
    return;
  }

  const toggle = event.target.closest("[data-summary-toggle]");
  if (!toggle) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    const panelKey = toggle.dataset.summaryToggle;
    const body = document.querySelector(`[data-summary-body="${panelKey}"]`);
    if (!body) return;

    setSummaryPanelExpanded(panelKey, body.hidden);
  }
});

  if (withinChip) {
    withinChip.addEventListener("click", async () => {
      cycleWithinHighlightMode();
      await refresh();
    });
  }

  if (liveColumnToggle) {
    liveColumnToggle.addEventListener("click", async () => {
      if (!isCurrentSelectionLiveSupported()) {
        showLiveColumn = false;
      } else {
        showLiveColumn = !showLiveColumn;
      }
      writeStorage(STORAGE_KEYS.showLiveColumn, String(showLiveColumn));
      syncLiveColumnAvailability();
      await refresh();
    });
  }

  customizeButton.addEventListener("click", () => {
    openCustomModal();
  });

  customCloseButton.addEventListener("click", closeCustomModal);
  customCancelButton.addEventListener("click", closeCustomModal);

  customModal.addEventListener("click", (event) => {
    if (event.target === customModal) {
      closeCustomModal();
    }
  });

  customRegionList.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-region-toggle]");
    if (!toggleButton) return;

    const region = toggleButton.dataset.regionToggle || "";
    if (!region) return;

    if (customExpandedRegions.has(region)) {
      customExpandedRegions.delete(region);
    } else {
      customExpandedRegions.add(region);
    }

    renderCustomRegionList();
  });

  customRegionList.addEventListener("change", (event) => {
    const nationCheck = event.target.closest("[data-nation-check]");
      if (nationCheck) {
        nationModeEnabled = nationCheck.checked;
      
        if (nationModeEnabled) {
          enabledAreaKeys.add(makeNationAreaKey());
        } else {
          enabledAreaKeys.delete(makeNationAreaKey());
      
          if (currentSelectionType === "nation") {
            currentSelectionType = "prefecture";
            writeStorage(STORAGE_KEYS.areaSelection, "prefecture");
          }
        }
      
        saveNationModeEnabled();
        saveEnabledAreaKeys();
      
        renderRegionTabs();
        renderPrefButtons();
        renderCustomRegionList();
        return;
      }
    const prefCheck = event.target.closest("[data-pref-check]");
    const areaCheck = event.target.closest("[data-area-check]");
    if (areaCheck) {
      const areaKey = areaCheck.dataset.areaCheck || "";
      if (!areaKey) return;
    
      if (areaCheck.checked) {
        enabledAreaKeys.add(areaKey);
      } else {
        enabledAreaKeys.delete(areaKey);
    
        if (
          currentSelectionType === "region" &&
          areaKey === makeRegionAreaKey(currentRegion)
        ) {
          currentSelectionType = "prefecture";
        }
      }
    
      saveEnabledAreaKeys();
      renderRegionTabs();
      renderPrefButtons();
      renderCustomRegionList();
      return;
    }
    if (prefCheck) {
      const prefKey = prefCheck.dataset.prefCheck || "";
      if (!prefKey) return;

      if (prefCheck.checked) {
        enabledPrefKeys.add(prefKey);
      } else {
        enabledPrefKeys.delete(prefKey);
      }

      renderCustomRegionList();
      return;
    }

    const regionBulk = event.target.closest("[data-region-bulk]");
    if (regionBulk) {
      const region = regionBulk.dataset.regionBulk || "";
      if (!region) return;

      getPrefsByRegion(region).forEach((item) => {
        if (regionBulk.checked) {
          enabledPrefKeys.add(item.key);
        } else {
          enabledPrefKeys.delete(item.key);
        }
      });

      renderCustomRegionList();
    }
  });

  selectAllPrefsButton.addEventListener("click", () => {
    getAllPrefKeys().forEach((key) => enabledPrefKeys.add(key));
    renderCustomRegionList();
  });

  clearAllPrefsButton.addEventListener("click", () => {
    enabledPrefKeys.clear();
    renderCustomRegionList();
  });

  customSaveButton.addEventListener("click", async () => {
    ensureAtLeastOneEnabledPref();

    const best = getBestRegionAndPref();
    currentRegion = best.region;
    currentPrefKey = best.prefKey;

    writeStorage(STORAGE_KEYS.region, currentRegion);
    writeStorage(STORAGE_KEYS.pref, currentPrefKey);
    saveEnabledPrefKeys();
    saveEnabledAreaKeys();
    saveNationModeEnabled();

    renderRegionTabs();
    renderPrefButtons();
    syncLiveColumnAvailability();
    closeCustomModal();
    await refresh();
  });
}

function startAutoRefresh() {
  setInterval(() => {
    refresh().catch((error) => {
      console.error("自動更新失敗:", error);
    });
  }, AUTO_REFRESH_INTERVAL);
}

function setSummaryExpanded(expanded) {
  liveSummaryBody.hidden = !expanded;
  summaryHeader.setAttribute("aria-expanded", String(expanded));
  summaryChevron.classList.toggle("expanded", expanded);
}

function setSummaryPanelExpanded(panelKey, expanded) {
  const body = document.querySelector(`[data-summary-body="${panelKey}"]`);
  const toggle = document.querySelector(`[data-summary-toggle="${panelKey}"]`);
  const chevron = document.querySelector(`[data-summary-chevron="${panelKey}"]`);
  if (!body || !toggle || !chevron) return;

  body.hidden = !expanded;
  toggle.setAttribute("aria-expanded", String(expanded));
  chevron.classList.toggle("expanded", expanded);
}

function getRegions() {
  const available = new Set(
    (state.prefectures || [])
      .map((item) => item.region)
      .filter(Boolean)
  );
  return STANDARD_REGIONS.filter((region) => available.has(region));
}

function getPrefsByRegion(region) {
  const prefs = (state.prefectures || []).filter((item) => item.region === region);
  const orderMap = new Map(defaultPrefOrderKeys.map((key, index) => [key, index]));
  return prefs.slice().sort((a, b) => {
    const ia = orderMap.has(a.key) ? orderMap.get(a.key) : Number.MAX_SAFE_INTEGER;
    const ib = orderMap.has(b.key) ? orderMap.get(b.key) : Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
}

function makeRegionAreaKey(region) {
  return `region:${region}`;
}

function makeNationAreaKey() {
  return "nation:all";
}

function getRegionFromAreaKey(areaKey) {
  return String(areaKey || "").replace(/^region:/, "");
}

function isRegionAreaEnabled(region) {
  return enabledAreaKeys.has(makeRegionAreaKey(region));
}

function isNationAreaEnabled() {
  return nationModeEnabled && enabledAreaKeys.has(makeNationAreaKey());
}

function loadEnabledAreaKeys() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.enabledAreas);
    if (!raw) {
      enabledAreaKeys = new Set();
      return;
    }

    const parsed = JSON.parse(raw);
    enabledAreaKeys = Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    enabledAreaKeys = new Set();
  }
}

function saveEnabledAreaKeys() {
  writeStorage(STORAGE_KEYS.enabledAreas, JSON.stringify([...enabledAreaKeys]));
}

function loadNationModeEnabled() {
  nationModeEnabled = readStorage(STORAGE_KEYS.nationModeEnabled, "false") === "true";
}

function saveNationModeEnabled() {
  writeStorage(STORAGE_KEYS.nationModeEnabled, String(nationModeEnabled));
}

function getAllRegionNames() {
  return getRegions();
}

function getAllPrefMetasForNation() {
  const result = [];
  const used = new Set();

  for (const region of getAllRegionNames()) {
    for (const pref of getPrefsByRegion(region)) {
      if (!used.has(pref.key)) {
        result.push(pref);
        used.add(pref.key);
      }
    }
  }

  return result;
}

function getCurrentSelectionLabel() {
  if (currentSelectionType === "nation") return "全国";
  if (currentSelectionType === "region") return currentRegion;
  const pref = getCurrentPrefMeta();
  return pref?.name || "";
}

function getVisiblePrefsByRegion(region) {
  return getPrefsByRegion(region).filter((item) => enabledPrefKeys.has(item.key));
}

function getEnabledRegions() {
  return getRegions().filter((region) => getVisiblePrefsByRegion(region).length > 0);
}

function ensureCurrentRegionAndPref() {
  const enabledRegions = getEnabledRegions();

  if (!enabledRegions.length) {
    currentRegion = "";
    currentPrefKey = "";
    return;
  }

  if (!enabledRegions.includes(currentRegion)) {
    currentRegion = enabledRegions[0];
  }

  const visiblePrefs = getVisiblePrefsByRegion(currentRegion);
  if (!visiblePrefs.some((item) => item.key === currentPrefKey)) {
    currentPrefKey = visiblePrefs[0]?.key || "";
  }
}

function getInitialRegion() {
  const regions = getRegions();
  const savedRegion = readStorage(STORAGE_KEYS.region);
  if (savedRegion && getVisiblePrefsByRegion(savedRegion).length > 0) {
    return savedRegion;
  }

  if (regions.includes(DEFAULT_REGION) && getVisiblePrefsByRegion(DEFAULT_REGION).length > 0) {
    return DEFAULT_REGION;
  }

  const fallbackRegion = regions.find((region) => getVisiblePrefsByRegion(region).length > 0);
  return fallbackRegion || regions[0] || "";
}

function getInitialPrefKey(region) {
  const visiblePrefs = getVisiblePrefsByRegion(region);
  const savedPref = readStorage(STORAGE_KEYS.pref);

  if (savedPref && visiblePrefs.some((item) => item.key === savedPref)) {
    return savedPref;
  }
  if (visiblePrefs.some((item) => item.key === DEFAULT_PREF)) {
    return DEFAULT_PREF;
  }
  return visiblePrefs[0]?.key || "";
}

function getBestRegionAndPref() {
  const regions = getEnabledRegions();

  if (currentRegion) {
    const visiblePrefs = getVisiblePrefsByRegion(currentRegion);
    if (visiblePrefs.length > 0) {
      if (visiblePrefs.some((item) => item.key === currentPrefKey)) {
        return { region: currentRegion, prefKey: currentPrefKey };
      }
      return { region: currentRegion, prefKey: visiblePrefs[0].key };
    }
  }

  for (const region of regions) {
    const visiblePrefs = getVisiblePrefsByRegion(region);
    if (visiblePrefs.length > 0) {
      return { region, prefKey: visiblePrefs[0].key };
    }
  }

  return { region: "", prefKey: "" };
}

function ensureAtLeastOneEnabledPref() {
  if (enabledPrefKeys.size > 0) return;
  enabledPrefKeys = new Set(getAllPrefKeys());
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
  return getPrefMetaByKey(currentPrefKey);
}

function getCurrentElementMeta() {
  return getCurrentElementList().find((item) => item.key === currentElementKey) || null;
}

function renderRegionTabs() {
  const regionList = getEnabledRegions();

  if (!regionList.length) {
    regionTabs.innerHTML = `<div class="empty-message">表示対象の地域がありません。カスタムから設定してください。</div>`;
    return;
  }

  const nationButton = isNationAreaEnabled()
    ? `
      <button
        type="button"
        class="region-tab ${currentSelectionType === "nation" ? "active" : ""}"
        data-nation-tab="true"
      >
        全国
      </button>
    `
    : "";

  regionTabs.innerHTML = `
    ${nationButton}
    ${regionList
      .map((region) => `
        <button
          type="button"
          class="region-tab ${region === currentRegion && currentSelectionType !== "nation" ? "active" : ""}"
          data-region-tab="${region}"
        >
          ${region}
        </button>
      `)
      .join("")}
  `;
}

function renderPrefButtons() {
  ensureCurrentRegionAndPref();

  if (currentSelectionType === "nation") {
    prefButtons.innerHTML = `
      <button type="button" class="pref-button active" data-nation-select="true">
        全国
      </button>
    `;
    return;
  }

  const prefList = currentRegion ? getVisiblePrefsByRegion(currentRegion) : [];
  const regionAreaEnabled = isRegionAreaEnabled(currentRegion);

  if (!prefList.length && !regionAreaEnabled) {
    prefButtons.innerHTML = `<div class="empty-message">表示対象の都道府県がありません。カスタムから設定してください。</div>`;
    return;
  }

  const regionButton = regionAreaEnabled
    ? `
      <button
        type="button"
        class="pref-button ${currentSelectionType === "region" ? "active" : ""}"
        data-region-area-select="${currentRegion}"
      >
        ${currentRegion}
      </button>
    `
    : "";

  const prefButtonHtml = prefList
    .map((item) => `
      <button
        type="button"
        class="pref-button ${currentSelectionType === "prefecture" && item.key === currentPrefKey ? "active" : ""}"
        data-pref-key="${item.key}"
      >
        ${item.name}
      </button>
    `)
    .join("");

  prefButtons.innerHTML = `${regionButton}${prefButtonHtml}`;
}

function renderElementButtons() {
  renderElementPanel(elementPanel, getCurrentElementList(), currentElementKey, currentMonth);
}

function openCustomModal() {
  if (customExpandedRegions.size === 0) {
    const initialRegion = currentRegion || getRegions()[0] || "";
    customExpandedRegions = initialRegion ? new Set([initialRegion]) : new Set();
  } else if (currentRegion) {
    customExpandedRegions.add(currentRegion);
  }

  renderCustomRegionList();
  customModal.hidden = false;
}

function closeCustomModal() {
  customModal.hidden = true;
}

function renderCustomRegionList() {
  const regions = getRegions();

  customRegionList.innerHTML = `
    <section class="region-accordion">
      <div class="region-accordion-header">
        <label class="region-bulk-wrap">
          <input
            type="checkbox"
            data-nation-check="true"
            ${isNationAreaEnabled() ? "checked" : ""}
          />
          <span>全国</span>
        </label>
      </div>
    </section>

    ${regions
      .map((region) => {
        const prefs = getPrefsByRegion(region);
        const enabledCount = prefs.filter((item) => enabledPrefKeys.has(item.key)).length;
        const allChecked = prefs.length > 0 && enabledCount === prefs.length;
        const expanded = customExpandedRegions.has(region);
        const regionAreaChecked = isRegionAreaEnabled(region);

        return `
          <section class="region-accordion">
            <div class="region-accordion-header">
              <label class="region-bulk-wrap">
                <input
                  type="checkbox"
                  data-region-bulk="${region}"
                  ${allChecked ? "checked" : ""}
                />
                <span>${region}</span>
              </label>

              <div class="region-accordion-title"></div>

              <button
                type="button"
                class="region-accordion-toggle"
                data-region-toggle="${region}"
                aria-expanded="${expanded ? "true" : "false"}"
              >
                ${expanded ? "閉じる" : "開く"}
              </button>
            </div>

            <div class="region-accordion-body" ${expanded ? "" : "hidden"}>
              <div class="region-pref-grid">
                <label class="region-pref-item region-area-item">
                  <input
                    type="checkbox"
                    data-area-check="${makeRegionAreaKey(region)}"
                    ${regionAreaChecked ? "checked" : ""}
                  />
                  <span>${region}</span>
                </label>

                ${prefs
                  .map((item) => `
                    <label class="region-pref-item">
                      <input
                        type="checkbox"
                        data-pref-check="${item.key}"
                        ${enabledPrefKeys.has(item.key) ? "checked" : ""}
                      />
                      <span>${item.name}</span>
                    </label>
                  `)
                  .join("")}
              </div>
            </div>
          </section>
        `;
      })
      .join("")}
  `;

  syncRegionBulkStates();
}

function syncRegionBulkStates() {
  customRegionList.querySelectorAll("[data-region-bulk]").forEach((input) => {
    const region = input.dataset.regionBulk;
    const prefs = getPrefsByRegion(region);
    const enabledCount = prefs.filter((item) => enabledPrefKeys.has(item.key)).length;
    input.indeterminate = enabledCount > 0 && enabledCount < prefs.length;
  });
}

function pickLatestObservedAt(latestObservationTime, liveValuesByCode) {
  if (latestObservationTime) return latestObservationTime;

  const observedList = Object.values(liveValuesByCode || {})
    .map((item) => item?.observedAt || "")
    .filter(Boolean)
    .sort();

  return observedList.length ? observedList[observedList.length - 1] : "";
}

function renderLiveOnlyTable(stations, liveValuesByCode, prefMeta) {
  const canShowLiveColumn = isCurrentSelectionLiveSupported() && showLiveColumn;

  if (!stations.length) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          この都道府県は現在データ未対応です
        </td>
      </tr>
    `;
    return;
  }

  const rows = stations.map((station) => {
    const live = liveValuesByCode?.[station.code];
    const valueText = Number.isFinite(live?.value) ? String(live.value) : "-";
    const timeText = live?.observedAt ? live.observedAt : "-";

    return `
      <tr>
        <td class="station-col">
          <span class="station-name">${station.name}</span>
          <span class="start-date">${station.startDate || "-"}</span>
        </td>
        <td class="rank-cell" colspan="${canShowLiveColumn ? 11 : 10}">
          <span class="rank-value">${valueText}</span>
          <span class="rank-date">${timeText}</span>
        </td>
      </tr>
    `;
  }).join("");

  rankTableBody.innerHTML = rows || `
    <tr>
      <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
        ${prefMeta?.name || "この都道府県"}は現在データ未対応です
      </td>
    </tr>
  `;
}

function getCurrentJstMonth(latestObservationTime = "") {
  const d = latestObservationTime ? new Date(latestObservationTime) : new Date();
  if (Number.isNaN(d.getTime())) return String(new Date().getMonth() + 1);
  return String(d.getMonth() + 1);
}

function getLiveSummaryTargets(latestObservationTime = "") {
  const currentJstMonth = getCurrentJstMonth(latestObservationTime);

  const annualTargets = getElementListByMonth("all", state.elements)
    .filter((item) => isLiveSupported(item.key, "all"))
    .map((item) => ({
      element: item,
      month: "all",
    }));

  const monthlyTargets = getElementListByMonth(currentJstMonth, state.elements)
    .filter((item) => isLiveSupported(item.key, currentJstMonth))
    .map((item) => ({
      element: item,
      month: currentJstMonth,
    }));

  return {
    annualTargets,
    monthlyTargets,
    currentJstMonth,
  };
}

async function buildAllLiveSummaryForPref({
  prefMeta,
  stationIndex,
  latestObservationTime,
}) {
  const { annualTargets, monthlyTargets } = getLiveSummaryTargets(latestObservationTime);

  const annualItems = [];
  const monthlyItems = [];

  async function collectForTarget(target, outputItems) {
    const elementMeta = target.element;
    const month = target.month;

    try {
      const tableData = await loadTable(
        prefMeta.key,
        prefMeta.region,
        elementMeta.key,
        month
      );

      const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
      if (!rows.length) return;

      const stationCodes = unique(
        rows
          .map((row) => findStationByRowName(row.stationName, stationIndex)?.code || null)
          .filter(Boolean)
      );

      if (!stationCodes.length) return;

      const liveBundle = await buildLiveValuesForStations({
        stationCodes,
        elementKey: elementMeta.key,
        month,
      });

      let valuesByCode = liveBundle.valuesByCode || {};

      updateLiveValueCache(valuesByCode, elementMeta.key, month);
      valuesByCode = mergeLiveValuesWithCache(
        stationCodes,
        valuesByCode,
        elementMeta.key,
        month
      );

      const decoratedRows = decorateRowsWithLive(
        rows,
        (rowStationName) => findStationByRowName(rowStationName, stationIndex),
        valuesByCode,
        elementMeta.key,
        liveBundle.support || "supported"
      );

      const items = buildLiveSummaryItems(
        decoratedRows,
        elementMeta.key,
        elementMeta.label || elementMeta.shortLabel || elementMeta.key,
        month
      );

      outputItems.push(...items);
    } catch (error) {
      console.warn("実況サマリー作成失敗:", elementMeta.key, month, error);
    }
  }

  await Promise.all([
    ...annualTargets.map((target) => collectForTarget(target, annualItems)),
    ...monthlyTargets.map((target) => collectForTarget(target, monthlyItems)),
  ]);

  return {
    annualItems,
    monthlyItems,
  };
}

async function buildDecoratedRowsForPref(prefMeta, elementMeta, month) {
  const [{ index }, tableData] = await Promise.all([
    loadStations(prefMeta.key, prefMeta.region),
    loadTable(prefMeta.key, prefMeta.region, elementMeta.key, month),
  ]);

  const rows = Array.isArray(tableData?.rows) ? tableData.rows : [];
  if (!rows.length) {
    return {
      prefMeta,
      rows: [],
      index,
    };
  }

  const stationCodes = unique(
    rows
      .map((row) => findStationByRowName(row.stationName, index)?.code || null)
      .filter(Boolean)
  );

  let liveSupportMode = "unsupported";
  let latestObservationTime = "";
  let liveValuesByCode = {};

  if (isLiveSupported(elementMeta.key, month) && stationCodes.length > 0) {
    try {
      const liveBundle = await buildLiveValuesForStations({
        stationCodes,
        elementKey: elementMeta.key,
        month,
      });

      latestObservationTime = liveBundle.latestIso || "";
      liveValuesByCode = liveBundle.valuesByCode || {};
      liveSupportMode = liveBundle.support || "supported";

      updateLiveValueCache(liveValuesByCode, elementMeta.key, month);
      liveValuesByCode = mergeLiveValuesWithCache(
        stationCodes,
        liveValuesByCode,
        elementMeta.key,
        month
      );
    } catch (error) {
      liveSupportMode = "error";
      liveValuesByCode = mergeLiveValuesWithCache(
        stationCodes,
        {},
        elementMeta.key,
        month
      );
      latestObservationTime = "";
    }
  }

  const decoratedRows = decorateRowsWithLive(
    rows,
    (rowStationName) => findStationByRowName(rowStationName, index),
    liveValuesByCode,
    elementMeta.key,
    liveSupportMode
  ).map((row) => ({
    ...row,
    prefName: prefMeta.name,
    sourcePrefName: prefMeta.name,
    sourcePrefKey: prefMeta.key,
    sourceRegion: prefMeta.region,
  }));

  return {
    prefMeta,
    rows: decoratedRows,
    latestObservationTime,
    index,
  };
}

async function buildAreaDisplayRows({
  areaName,
  areaLabel,
  prefMetas,
  elementMeta,
  month,
}) {
  const prefResults = await Promise.all(
    prefMetas.map((prefMeta) =>
      buildDecoratedRowsForPref(prefMeta, elementMeta, month).catch((error) => {
        console.warn("地域表示用データ取得失敗:", prefMeta.name, error);
        return {
          prefMeta,
          rows: [],
          latestObservationTime: "",
        };
      })
    )
  );

  const allStationRows = prefResults.flatMap((result) => result.rows || []);

  const highlightedAllRows = applyHighlightModeToRows(
    allStationRows,
    withinHighlightMode,
    ""
  );

  const areaAggregateRow = buildAreaAggregateRow(
    highlightedAllRows,
    areaName,
    areaLabel,
    elementMeta.key
  );

  const prefAggregateRows = [];

  for (const result of prefResults) {
    const prefRows = highlightedAllRows.filter(
      (row) => row.sourcePrefKey === result.prefMeta.key
    );

    const prefAggregate = buildPrefectureAggregateRow(
      prefRows,
      result.prefMeta.name,
      elementMeta.key
    );

    if (prefAggregate) {
      prefAggregateRows.push({
        ...prefAggregate,
        prefName: result.prefMeta.name,
        sourcePrefName: result.prefMeta.name,
        sourcePrefKey: result.prefMeta.key,
        sourceRegion: result.prefMeta.region,
      });
    }
  }

  return {
    rows: insertLiveIntoRankRows(
      [areaAggregateRow, ...prefAggregateRows].filter(Boolean)
    ),
    latestObservationTime:
      prefResults
        .map((result) => result.latestObservationTime || "")
        .filter(Boolean)
        .sort()
        .at(-1) || "",
  };
}

async function buildNationDisplayRows(elementMeta, month) {
  const regionRows = [];
  const allPrefRows = [];
  const allStationRows = [];
  const latestList = [];

  for (const region of getAllRegionNames()) {
    const prefMetas = getPrefsByRegion(region);
    const regionResult = await buildAreaDisplayRows({
      areaName: region,
      areaLabel: "地域総合",
      prefMetas,
      elementMeta,
      month,
    });

    if (regionResult.latestObservationTime) {
      latestList.push(regionResult.latestObservationTime);
    }

    const regionAggregate = regionResult.rows?.[0] || null;
    if (regionAggregate) {
      regionRows.push(regionAggregate);
    }

    allPrefRows.push(...(regionResult.rows || []).slice(1));

    const prefStationRows = await Promise.all(
      prefMetas.map((prefMeta) =>
        buildDecoratedRowsForPref(prefMeta, elementMeta, month).catch(() => ({
          prefMeta,
          rows: [],
          latestObservationTime: "",
        }))
      )
    );

    for (const result of prefStationRows) {
      allStationRows.push(...(result.rows || []));
      if (result.latestObservationTime) {
        latestList.push(result.latestObservationTime);
      }
    }
  }

  const highlightedAllStationRows = applyHighlightModeToRows(
    allStationRows,
    withinHighlightMode,
    ""
  );

  const nationAggregateRow = buildAreaAggregateRow(
    highlightedAllStationRows,
    "全国",
    "全国総合",
    elementMeta.key
  );

  return {
    rows: insertLiveIntoRankRows(
      [nationAggregateRow, ...regionRows, ...allPrefRows].filter(Boolean)
    ),
    latestObservationTime: latestList.filter(Boolean).sort().at(-1) || "",
  };
}

async function refresh() {
  const elementMeta = getCurrentElementMeta();
  const canShowLiveColumn = isCurrentSelectionLiveSupported() && showLiveColumn;

  makeTableHead(rankTableHead, canShowLiveColumn);

  if (!elementMeta) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          要素が未選択です。
        </td>
      </tr>
    `;
    rankInBadge.hidden = true;
    topRankAlert.hidden = true;
    observedLatestAtEl.textContent = "実況未取得";
    return;
  }

  const fullLabel = elementMeta.label || elementMeta.shortLabel || elementMeta.key;

  state.debug.selectedRegion = currentRegion;
  state.debug.selectedMonth = currentMonth;
  state.debug.selectedElementKey = elementMeta.key;
  state.debug.selectedElementLabel = fullLabel;
  state.debug.pointFetchCount = 0;
  state.debug.liveError = "";

  // =========================
  // 地域表示
  // =========================
  if (currentSelectionType === "region") {
    state.debug.selectedPrefKey = makeRegionAreaKey(currentRegion);
    state.debug.selectedPrefName = currentRegion;

    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          地域ランキングを作成中です…
        </td>
      </tr>
    `;

    try {
      const prefMetas = getPrefsByRegion(currentRegion);

      const areaResult = await buildAreaDisplayRows({
        areaName: currentRegion,
        areaLabel: "地域総合",
        prefMetas,
        elementMeta,
        month: currentMonth,
      });

      state.debug.tableRowCount = areaResult.rows.length;
      state.debug.latestObservationTime = areaResult.latestObservationTime;
      state.debug.summaryItemCount = 0;

      renderTable(rankTableBody, areaResult.rows, {
        showLiveColumn: canShowLiveColumn,
      });

      renderLiveSummary(liveSummaryBody, [], []);
      rankInBadge.hidden = true;
      topRankAlert.hidden = true;

      renderStatus({
        tableTitleEl,
        statusTextEl,
        observedLatestAtEl,
        prefName: currentRegion,
        month: currentMonth,
        elementLabel: fullLabel,
        rowCount: areaResult.rows.length,
        latestObservationTime: areaResult.latestObservationTime,
      });

      renderDebug(debugGrid, state.debug);
    } catch (error) {
      console.error(error);
      rankTableBody.innerHTML = `
        <tr>
          <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
            地域ランキングの作成に失敗しました: ${error.message || String(error)}
          </td>
        </tr>
      `;
      state.debug.liveError = error.message || String(error);
      renderDebug(debugGrid, state.debug);
    }

    return;
  }

  // =========================
  // 全国表示
  // =========================
  if (currentSelectionType === "nation") {
    state.debug.selectedPrefKey = "nation";
    state.debug.selectedPrefName = "全国";

    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          全国ランキングを作成中です…
        </td>
      </tr>
    `;

    try {
      const nationResult = await buildNationDisplayRows(elementMeta, currentMonth);

      state.debug.tableRowCount = nationResult.rows.length;
      state.debug.latestObservationTime = nationResult.latestObservationTime;
      state.debug.summaryItemCount = 0;

      renderTable(rankTableBody, nationResult.rows, {
        showLiveColumn: canShowLiveColumn,
      });

      renderLiveSummary(liveSummaryBody, [], []);
      rankInBadge.hidden = true;
      topRankAlert.hidden = true;

      renderStatus({
        tableTitleEl,
        statusTextEl,
        observedLatestAtEl,
        prefName: "全国",
        month: currentMonth,
        elementLabel: fullLabel,
        rowCount: nationResult.rows.length,
        latestObservationTime: nationResult.latestObservationTime,
      });

      renderDebug(debugGrid, state.debug);
    } catch (error) {
      console.error(error);
      rankTableBody.innerHTML = `
        <tr>
          <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
            全国ランキングの作成に失敗しました: ${error.message || String(error)}
          </td>
        </tr>
      `;
      state.debug.liveError = error.message || String(error);
      renderDebug(debugGrid, state.debug);
    }

    return;
  }

  // =========================
  // 通常の都道府県表示
  // =========================
  const prefMeta = getCurrentPrefMeta();

  if (!prefMeta) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          都道府県が未選択です。
        </td>
      </tr>
    `;
    rankInBadge.hidden = true;
    topRankAlert.hidden = true;
    observedLatestAtEl.textContent = "実況未取得";
    return;
  }

  state.debug.selectedPrefKey = prefMeta.key;
  state.debug.selectedPrefName = prefMeta.name;

  rankTableBody.innerHTML = `
    <tr>
      <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
        読み込み中です…
      </td>
    </tr>
  `;

  try {
    const [{ stations, index }, tableData] = await Promise.all([
      loadStations(prefMeta.key, prefMeta.region),
      loadTable(prefMeta.key, prefMeta.region, elementMeta.key, currentMonth),
    ]);

    const hasTable = !!(tableData && Array.isArray(tableData.rows) && tableData.rows.length > 0);
    const rows = hasTable ? tableData.rows : [];
    state.debug.tableRowCount = rows.length;

    const neededStationCodes = hasTable
      ? unique(
          rows
            .map((row) => findStationByRowName(row.stationName, index)?.code || null)
            .filter(Boolean)
        )
      : unique((stations || []).map((station) => station.code).filter(Boolean));

    let liveSupportMode = "unsupported";
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

        updateLiveValueCache(liveValuesByCode, elementMeta.key, currentMonth);
        liveValuesByCode = mergeLiveValuesWithCache(
          neededStationCodes,
          liveValuesByCode,
          elementMeta.key,
          currentMonth
        );
      } catch (error) {
        liveSupportMode = "error";
        state.debug.liveError = error.message || String(error);
        liveValuesByCode = mergeLiveValuesWithCache(
          neededStationCodes,
          {},
          elementMeta.key,
          currentMonth
        );
        latestObservationTime = "";
      }
    }

    latestObservationTime = pickLatestObservedAt(latestObservationTime, liveValuesByCode);

    state.debug.latestObservationTime = latestObservationTime;
    state.debug.liveSupported = liveSupportMode;

    if (hasTable) {
      const decoratedRows = decorateRowsWithLive(
        rows,
        (rowStationName) => findStationByRowName(rowStationName, index),
        liveValuesByCode,
        elementMeta.key,
        liveSupportMode
      );

      const highlightedRows = applyHighlightModeToRows(
        decoratedRows,
        withinHighlightMode,
        latestObservationTime
      );

      const prefectureAggregateRow = buildPrefectureAggregateRow(
        highlightedRows,
        prefMeta.name,
        elementMeta.key
      );

      const baseDisplayRows = prefectureAggregateRow
        ? [prefectureAggregateRow, ...highlightedRows]
        : highlightedRows;

      const displayRows = insertLiveIntoRankRows(baseDisplayRows);

      const allSummary = await buildAllLiveSummaryForPref({
        prefMeta,
        stationIndex: index,
        latestObservationTime,
      });

      const annualSummary = allSummary.annualItems;
      const monthlySummary = allSummary.monthlyItems;

      state.debug.summaryItemCount = annualSummary.length + monthlySummary.length;

      renderTable(rankTableBody, displayRows, {
        showLiveColumn: canShowLiveColumn,
      });

      renderLiveSummary(liveSummaryBody, annualSummary, monthlySummary);

      const totalSummaryCount = annualSummary.length + monthlySummary.length;
      const hasTop1Summary =
        annualSummary.some((item) => item.rank === 1) ||
        monthlySummary.some((item) => item.rank === 1) ||
        prefectureAggregateRow?.liveCandidate?.rank === 1;

      const hasAnyPrefRankIn =
        Number.isFinite(prefectureAggregateRow?.liveCandidate?.rank) &&
        prefectureAggregateRow.liveCandidate.rank >= 1 &&
        prefectureAggregateRow.liveCandidate.rank <= 10;

      if (totalSummaryCount === 0 && !hasAnyPrefRankIn) {
        rankInBadge.hidden = true;
        topRankAlert.hidden = true;
      } else if (hasTop1Summary) {
        rankInBadge.hidden = true;
        topRankAlert.hidden = false;
      } else {
        rankInBadge.hidden = false;
        topRankAlert.hidden = true;
      }
    } else {
      renderLiveOnlyTable(stations || [], liveValuesByCode, prefMeta);
      renderLiveSummary(liveSummaryBody, [], []);
      state.debug.summaryItemCount = 0;
      rankInBadge.hidden = true;
      topRankAlert.hidden = true;
    }

    renderStatus({
      tableTitleEl,
      statusTextEl,
      observedLatestAtEl,
      prefName: prefMeta.name,
      month: currentMonth,
      elementLabel: fullLabel,
      rowCount: hasTable ? rows.length + 1 : (stations || []).length,
      latestObservationTime,
    });

    renderDebug(debugGrid, state.debug);
  } catch (error) {
    console.error(error);
    rankTableBody.innerHTML = `
      <tr>
        <td class="message-cell" colspan="${getTotalTableColspan(canShowLiveColumn)}">
          表示に失敗しました: ${error.message || String(error)}
        </td>
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

const themeToggle = document.getElementById("themeToggle");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  if (themeToggle) {
    themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  }
}

function initTheme() {
  const saved = localStorage.getItem("theme") || "light";
  applyTheme(saved);
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });
}

initTheme();
