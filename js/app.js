const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const topRankAlert = document.getElementById("topRankAlert");

const liveSummaryBody = document.getElementById("liveSummaryBody");
const rankInBadge = document.getElementById("rankInBadge");
const elementPanel = document.getElementById("elementPanel");
const statusBox = document.getElementById("statusBox");
const debugGrid = document.getElementById("debugGrid");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");

const STORAGE_KEYS = {
  region: "weather_extreme_region",
  pref: "weather_extreme_pref",
  month: "weather_extreme_month",
  element: "weather_extreme_element"
};

let appState = {
  prefectures: null,
  elements: null,
  elementLabelMap: new Map(),
  selectedRegion: "",
  selectedPref: "",
  selectedMonth: "all",
  selectedElement: "",
  manifest: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  if (!statusBox) return;
  statusBox.textContent = message;
}

function hideStatusBox() {
  if (!statusBox) return;
  statusBox.style.display = "none";
}

function showStatusBox() {
  if (!statusBox) return;
  statusBox.style.display = "";
}

function setDebug(entries) {
  if (!debugGrid) return;
  debugGrid.innerHTML = "";
  for (const [key, value] of entries) {
    const k = document.createElement("div");
    const v = document.createElement("div");
    k.className = "debug-key";
    v.className = "debug-value";
    k.textContent = key;
    v.textContent = value ?? "";
    debugGrid.appendChild(k);
    debugGrid.appendChild(v);
  }
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} の取得に失敗しました (${res.status})`);
  }
  return await res.json();
}

function getSavedValue(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

function buildRegionMap(prefectureConfig) {
  const map = new Map();
  const items = prefectureConfig?.prefectures || [];

  for (const item of items) {
    const region = item.region || "未分類";
    if (!map.has(region)) {
      map.set(region, []);
    }
    map.get(region).push(item);
  }

  return map;
}

function buildElementLabelMap(elementsConfig) {
  const map = new Map();
  const groups = elementsConfig?.groups || [];

  for (const group of groups) {
    for (const item of group.items || []) {
      map.set(item.key, item.label);
    }
  }

  return map;
}

function getElementLabelFromAnyKey(raw) {
  if (!raw) return "";

  if (appState.elementLabelMap.has(raw)) {
    return appState.elementLabelMap.get(raw);
  }

  const normalized = String(raw).trim();
  if (appState.elementLabelMap.has(normalized)) {
    return appState.elementLabelMap.get(normalized);
  }

  const lower = normalized.toLowerCase();
  for (const [key, label] of appState.elementLabelMap.entries()) {
    if (String(key).toLowerCase() === lower) {
      return label;
    }
  }

  return normalized;
}

function fillRegionSelect(prefectureConfig) {
  const regionMap = buildRegionMap(prefectureConfig);
  regionSelect.innerHTML = "";

  for (const regionName of regionMap.keys()) {
    const option = document.createElement("option");
    option.value = regionName;
    option.textContent = regionName;
    regionSelect.appendChild(option);
  }

  const saved = getSavedValue(STORAGE_KEYS.region);
  if (saved && regionMap.has(saved)) {
    regionSelect.value = saved;
  }

  appState.selectedRegion = regionSelect.value;
}

function fillPrefSelect(prefectureConfig) {
  const regionMap = buildRegionMap(prefectureConfig);
  const list = regionMap.get(appState.selectedRegion) || [];

  prefSelect.innerHTML = "";

  for (const pref of list) {
    const option = document.createElement("option");
    option.value = pref.key;
    option.textContent = pref.name;
    prefSelect.appendChild(option);
  }

  const saved = getSavedValue(STORAGE_KEYS.pref);
  const found = list.find((x) => x.key === saved);
  if (found) {
    prefSelect.value = saved;
  }

  appState.selectedPref = prefSelect.value;
}

function fillElementPanel(elementsConfig) {
  elementPanel.innerHTML = "";

  const groups = elementsConfig?.groups || [];
  let firstElementKey = "";

  for (const group of groups) {
    const row = document.createElement("div");
    row.className = "element-row";

    const label = document.createElement("div");
    label.className = "element-label";
    label.textContent = group.label || "";

    const options = document.createElement("div");
    options.className = "element-options";

    for (const item of group.items || []) {
      if (!firstElementKey) firstElementKey = item.key;

      const wrap = document.createElement("label");

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "element";
      input.value = item.key;

      const span = document.createElement("span");
      span.textContent = item.label;

      wrap.appendChild(input);
      wrap.appendChild(span);
      options.appendChild(wrap);

      input.addEventListener("change", async () => {
        appState.selectedElement = input.value;
        saveValue(STORAGE_KEYS.element, input.value);
        await refreshAll();
      });
    }

    row.appendChild(label);
    row.appendChild(options);
    elementPanel.appendChild(row);
  }

  const saved = getSavedValue(STORAGE_KEYS.element);
  const radioList = [...document.querySelectorAll('input[name="element"]')];
  const selectedRadio =
    radioList.find((r) => r.value === saved) ||
    radioList.find((r) => r.value === firstElementKey);

  if (selectedRadio) {
    selectedRadio.checked = true;
    appState.selectedElement = selectedRadio.value;
  }
}

function buildTableHead() {
  rankTableHead.innerHTML = `
    <tr>
      <th class="station-col">地点</th>
      <th>1位</th>
      <th>2位</th>
      <th>3位</th>
      <th>4位</th>
      <th>5位</th>
      <th>6位</th>
      <th>7位</th>
      <th>8位</th>
      <th>9位</th>
      <th>10位</th>
    </tr>
  `;
}

function normalizeSummaryItems(items) {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const rank =
      Number(item.rank) ||
      Number(item.currentRank) ||
      Number(item.rankNo) ||
      null;

    return {
      rank,
      rankText: item.rankText || (rank ? `${rank}位` : ""),
      station: item.stationName || item.station || item.point || "",
      element:
        item.elementLabel ||
        getElementLabelFromAnyKey(item.elementKey) ||
        getElementLabelFromAnyKey(item.elementName) ||
        getElementLabelFromAnyKey(item.element) ||
        "",
      value: item.valueText || item.value || "",
      monthLabel: item.monthLabel || ""
    };
  });
}

function formatLiveSummaryItems(items) {
  if (!items || items.length === 0) {
    return `<div class="live-summary-empty">該当なし</div>`;
  }

  return items.map((item) => {
    const cls = [
      "live-summary-item",
      item.rank === 1 ? "live-summary-item-top1" : "",
      "live-summary-item-rankin"
    ].join(" ");

    return `
      <div class="${cls}">
        <div class="live-summary-line">
          <span class="live-summary-token live-summary-rank">${escapeHtml(item.rankText || "")}</span>
          <span class="live-summary-token live-summary-element">${escapeHtml(item.element || "")}</span>
          <span class="live-summary-token live-summary-station">${escapeHtml(item.station || "")}</span>
          <span class="live-summary-token live-summary-value">${escapeHtml(item.value || "")}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderLiveSummary(summaryData) {
  const annualItems = normalizeSummaryItems(summaryData?.annualItems || []);
  const monthlyItems = normalizeSummaryItems(summaryData?.monthlyItems || []);

  const hasTop1 =
    annualItems.some((item) => item.rank === 1) ||
    monthlyItems.some((item) => item.rank === 1);

  const hasRankIn =
    annualItems.length > 0 || monthlyItems.length > 0;

  rankInBadge.hidden = !hasRankIn;
  topRankAlert.hidden = !hasTop1;

  liveSummaryBody.innerHTML = `
    <div class="live-summary-grid">
      <div class="live-summary-column">
        <div class="live-summary-column-title">通年</div>
        <div class="live-summary-scroll">
          ${formatLiveSummaryItems(annualItems)}
        </div>
      </div>
      <div class="live-summary-column">
        <div class="live-summary-column-title">当月</div>
        <div class="live-summary-scroll">
          ${formatLiveSummaryItems(monthlyItems)}
        </div>
      </div>
    </div>
  `;
}

function normalizeStations(tableData) {
  const sourceRows = Array.isArray(tableData?.rows)
    ? tableData.rows
    : Array.isArray(tableData?.stations)
      ? tableData.stations
      : [];

  return sourceRows.map((station) => ({
    stationName: station.stationName || station.name || station.station || "",
    startDate: station.startDate || station.start || "",
    startSub: station.startSub || "",
    ranks: Array.isArray(station.ranks)
      ? station.ranks.map((rank) => ({
          value: rank?.value ?? rank?.valueText ?? "",
          date: rank?.date ?? rank?.dateText ?? "",
          dateSub: rank?.dateSub ?? "",
          highlightLive: Boolean(rank?.highlightLive ?? rank?.liveInRank),
          highlightWithinYear: Boolean(rank?.highlightWithinYear ?? rank?.withinYear)
        }))
      : []
  }));
}

function formatStationCell(station) {
  return `
    <div class="station-name">${escapeHtml(station.stationName || "")}</div>
    <div class="station-start">
      観測開始 ${escapeHtml(station.startDate || "")}
      ${station.startSub ? `<span class="sub">${escapeHtml(station.startSub)}</span>` : ""}
    </div>
  `;
}

function formatRankCell(rank) {
  if (!rank) {
    return `<td class="rank-cell"></td>`;
  }

  const classes = ["rank-cell"];
  if (rank.highlightLive) classes.push("live-in-rank");
  if (rank.highlightWithinYear) classes.push("within-year");

  return `
    <td class="${classes.join(" ")}">
      <div class="value">${escapeHtml(rank.value ?? "")}</div>
      <div class="date">
        ${escapeHtml(rank.date || "")}
        ${rank.dateSub ? `<span class="sub">${escapeHtml(rank.dateSub)}</span>` : ""}
      </div>
    </td>
  `;
}

function renderRankTable(tableData) {
  buildTableHead();

  const stations = normalizeStations(tableData);

  if (!stations.length) {
    rankTableBody.innerHTML = `
      <tr>
        <td class="station-col">該当なし</td>
        <td colspan="10"></td>
      </tr>
    `;
    return;
  }

  rankTableBody.innerHTML = stations.map((station) => {
    const cells = [];
    for (let i = 0; i < 10; i += 1) {
      cells.push(formatRankCell(station.ranks[i]));
    }

    return `
      <tr>
        <td class="station-col">${formatStationCell(station)}</td>
        ${cells.join("")}
      </tr>
    `;
  }).join("");
}

async function loadManifest() {
  try {
    appState.manifest = await fetchJson("./data/manifest.json");
  } catch {
    appState.manifest = null;
  }
}

function getCurrentDataPaths() {
  const pref = appState.selectedPref;
  const month = appState.selectedMonth;
  const element = appState.selectedElement;

  return {
    liveSummaryPath: `./data/${pref}/live-summary.json`,
    tablePath: `./data/${pref}/${element}-${month}.json`,
    metaPath: `./data/${pref}/meta.json`
  };
}

async function loadLiveSummary() {
  const { liveSummaryPath } = getCurrentDataPaths();

  try {
    const data = await fetchJson(liveSummaryPath);
    renderLiveSummary(data);
    return { ok: true, path: liveSummaryPath };
  } catch (err) {
    liveSummaryBody.innerHTML = `<div class="live-summary-empty">実況一覧の読み込みに失敗しました</div>`;
    rankInBadge.hidden = true;
    topRankAlert.hidden = true;
    return { ok: false, path: liveSummaryPath, error: err.message };
  }
}

async function loadRankingTable() {
  const { tablePath } = getCurrentDataPaths();

  try {
    const data = await fetchJson(tablePath);
    renderRankTable(data);
    return { ok: true, path: tablePath };
  } catch (err) {
    renderRankTable({ rows: [] });
    return { ok: false, path: tablePath, error: err.message };
  }
}

async function refreshAll() {
  if (!appState.selectedPref || !appState.selectedElement) {
    return;
  }

  showStatusBox();
  setStatus("読み込み中...");

  const liveResult = await loadLiveSummary();
  const tableResult = await loadRankingTable();

  const manifestTime =
    appState.manifest?.observation_time ||
    appState.manifest?.latest_time ||
    appState.manifest?.base_time ||
    "不明";

  setDebug([
    ["地域", appState.selectedRegion],
    ["都道府県", appState.selectedPref],
    ["月", appState.selectedMonth],
    ["要素", appState.selectedElement],
    ["実況一覧パス", liveResult.path || ""],
    ["表データパス", tableResult.path || ""],
    ["manifest 基準時刻", manifestTime],
    ["実況一覧", liveResult.ok ? "成功" : `失敗: ${liveResult.error}`],
    ["表データ", tableResult.ok ? "成功" : `失敗: ${tableResult.error}`]
  ]);

  hideStatusBox();
}

function applySavedMonth() {
  const savedMonth = getSavedValue(STORAGE_KEYS.month, "all");
  monthSelect.value = savedMonth;
  appState.selectedMonth = monthSelect.value;
}

function bindEvents() {
  regionSelect.addEventListener("change", async () => {
    appState.selectedRegion = regionSelect.value;
    saveValue(STORAGE_KEYS.region, appState.selectedRegion);

    fillPrefSelect(appState.prefectures);
    saveValue(STORAGE_KEYS.pref, appState.selectedPref);

    await refreshAll();
  });

  prefSelect.addEventListener("change", async () => {
    appState.selectedPref = prefSelect.value;
    saveValue(STORAGE_KEYS.pref, appState.selectedPref);
    await refreshAll();
  });

  monthSelect.addEventListener("change", async () => {
    appState.selectedMonth = monthSelect.value;
    saveValue(STORAGE_KEYS.month, appState.selectedMonth);
    await refreshAll();
  });

  topRankAlert.addEventListener("click", () => {
    document.getElementById("liveSummarySection")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

async function init() {
  try {
    setStatus("初期化中...");

    const [prefectures, elements] = await Promise.all([
      fetchJson("./config/prefectures.json"),
      fetchJson("./config/elements.json")
    ]);

    appState.prefectures = prefectures;
    appState.elements = elements;
    appState.elementLabelMap = buildElementLabelMap(elements);

    fillRegionSelect(prefectures);
    fillPrefSelect(prefectures);
    applySavedMonth();
    fillElementPanel(elements);

    appState.selectedRegion = regionSelect.value;
    appState.selectedPref = prefSelect.value;
    appState.selectedMonth = monthSelect.value;

    await loadManifest();
    bindEvents();
    await refreshAll();
  } catch (err) {
    showStatusBox();
    setStatus(`初期化に失敗しました: ${err.message}`);
    setDebug([["エラー", err.message]]);
  }
}

init();
