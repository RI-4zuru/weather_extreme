const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const topRankAlert = document.getElementById("topRankAlert");
const rankInBadge = document.getElementById("rankInBadge");
const observedLatestAtEl = document.getElementById("observedLatestAt");
const liveSummaryBody = document.getElementById("liveSummaryBody");
const elementPanel = document.getElementById("elementPanel");
const elementPanelToggle = document.getElementById("elementPanelToggle");
const statusBox = document.getElementById("statusBox");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");
const debugGrid = document.getElementById("debugGrid");

let prefecturesConfig = null;
let elementsConfig = null;
let manifestCache = null;
let refreshTimer = null;
let restoreScrollPending = false;
let restoredInitialScroll = false;

const FALLBACK_DEFAULTS = {
  region: "近畿",
  pref: "osaka",
  month: "all",
  annualElement: "dailyPrecip",
  monthlyElement: "dailyPrecip",
};

const UI_STATE_STORAGE_KEY = "weatherExtremeUIState_v1";

// 現時点では基礎ランキングを data_base から表示
const BASE_RANKING_DIR = "./data_base";

// 実況一覧は data 側
const LIVE_DATA_DIR = "./data";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(isoText) {
  if (!isoText) return "-";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return String(isoText);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function toWarekiYearText(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return "";
  if (y >= 2019) return `令和${y - 2018 === 1 ? "元" : y - 2018}年`;
  if (y >= 1989) return `平成${y - 1988 === 1 ? "元" : y - 1988}年`;
  if (y >= 1926) return `昭和${y - 1925 === 1 ? "元" : y - 1925}年`;
  if (y >= 1912) return `大正${y - 1911 === 1 ? "元" : y - 1911}年`;
  return `明治${y - 1867 === 1 ? "元" : y - 1867}年`;
}

function splitJapaneseDateLines(text) {
  if (!text) return { first: "-", second: "" };

  const raw = String(text).trim();

  const m1 = raw.match(/^(\d{4}年\d{1,2}月\d{1,2}日)（(.+)）$/);
  if (m1) return { first: m1[1], second: `（${m1[2]}）` };

  const m2 = raw.match(/^(\d{4}年\d{1,2}月)（(.+)）$/);
  if (m2) return { first: m2[1], second: `（${m2[2]}）` };

  const m3 = raw.match(/^(\d{4})年$/);
  if (m3) {
    return {
      first: `${m3[1]}年`,
      second: `（${toWarekiYearText(m3[1])}）`,
    };
  }

  const m4 = raw.match(/^(\d{4})寒候年$/);
  if (m4) {
    return {
      first: `${m4[1]}寒候年`,
      second: `（${toWarekiYearText(m4[1])}）`,
    };
  }

  const m5 = raw.match(/^(\d{4})年寒候年$/);
  if (m5) {
    return {
      first: `${m5[1]}寒候年`,
      second: `（${toWarekiYearText(m5[1])}）`,
    };
  }

  return { first: raw, second: "" };
}

function renderStartDateTwoLines(text) {
  const lines = splitJapaneseDateLines(text);
  if (!lines.second) {
    return `
      <div class="station-start-date">
        <div>${escapeHtml(lines.first)}</div>
      </div>
    `;
  }

  return `
    <div class="station-start-date">
      <div>${escapeHtml(lines.first)}</div>
      <div>${escapeHtml(lines.second)}</div>
    </div>
  `;
}

function renderRankDateTwoLines(text) {
  const lines = splitJapaneseDateLines(text);
  return `
    <div class="rank-date-wrap">
      <div>${escapeHtml(lines.first || "-")}</div>
      <div>${escapeHtml(lines.second || "")}</div>
    </div>
  `;
}

function parseObservedDate(isoText) {
  if (!isoText) return null;
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function parseRankDateLabelToYmd(label) {
  if (!label) return null;
  const m = String(label).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(
    Number(m[3])
  ).padStart(2, "0")}`;
}

function setBadgeVisible(el, visible) {
  if (!el) return;
  el.hidden = !visible;
  el.setAttribute("aria-hidden", String(!visible));
  el.style.display = visible ? "" : "none";
}

async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} の取得に失敗しました: HTTP ${res.status}`);
  }
  return await res.json();
}

function loadUIState() {
  try {
    const raw = localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.error("UI状態の読込に失敗しました", err);
    return null;
  }
}

function saveUIState() {
  try {
    const state = {
      region: regionSelect?.value || "",
      pref: prefSelect?.value || "",
      month: monthSelect?.value || "all",
      annualElement: getSavedAnnualElementKey(),
      monthlyElement: getSavedMonthlyElementKey(),
      elementPanelOpen: isElementPanelOpen(),
      scrollY: window.scrollY || 0,
    };
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("UI状態の保存に失敗しました", err);
  }
}

function isElementPanelOpen() {
  if (!elementPanel) return true;
  return !elementPanel.classList.contains("collapsed");
}

function setElementPanelOpen(open) {
  if (!elementPanel) return;
  if (open) {
    elementPanel.classList.remove("collapsed");
  } else {
    elementPanel.classList.add("collapsed");
  }
  if (elementPanelToggle) {
    elementPanelToggle.setAttribute("aria-expanded", String(open));
  }
}

function restoreScrollPosition(force = false) {
  const saved = loadUIState();
  if (!saved || typeof saved.scrollY !== "number") return;
  if (!force && !restoreScrollPending) return;

  requestAnimationFrame(() => {
    window.scrollTo(0, saved.scrollY);
    restoreScrollPending = false;
  });
}

function markScrollRestorePending() {
  restoreScrollPending = true;
}

function getSavedAnnualElementKey() {
  const saved = loadUIState();
  if (saved?.annualElement) return saved.annualElement;
  return elementsConfig?.annualDefaultElement || FALLBACK_DEFAULTS.annualElement;
}

function getSavedMonthlyElementKey() {
  const saved = loadUIState();
  if (saved?.monthlyElement) return saved.monthlyElement;
  return elementsConfig?.monthlyDefaultElement || FALLBACK_DEFAULTS.monthlyElement;
}

function pickValidElementKey(list, candidateKey, fallbackKey) {
  const keys = Array.isArray(list) ? list.map((item) => item.key) : [];
  if (candidateKey && keys.includes(candidateKey)) return candidateKey;
  if (fallbackKey && keys.includes(fallbackKey)) return fallbackKey;
  return list?.[0]?.key || "";
}

function getPreferredElementKeyForCurrentMonth() {
  const list = getActiveElementList();
  const saved = loadUIState();

  if (monthSelect.value === "all") {
    return pickValidElementKey(
      list,
      saved?.annualElement,
      elementsConfig?.annualDefaultElement || FALLBACK_DEFAULTS.annualElement
    );
  }

  return pickValidElementKey(
    list,
    saved?.monthlyElement,
    elementsConfig?.monthlyDefaultElement || FALLBACK_DEFAULTS.monthlyElement
  );
}

function updateSavedElementKeyForCurrentMonth(selectedKey) {
  const saved = loadUIState() || {};

  if (monthSelect.value === "all") {
    saved.annualElement = selectedKey;
  } else {
    saved.monthlyElement = selectedKey;
  }

  saved.region = regionSelect?.value || saved.region || "";
  saved.pref = prefSelect?.value || saved.pref || "";
  saved.month = monthSelect?.value || saved.month || "all";
  saved.elementPanelOpen = isElementPanelOpen();
  saved.scrollY = window.scrollY || 0;

  try {
    localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(saved));
  } catch (err) {
    console.error("要素選択状態の保存に失敗しました", err);
  }
}

async function loadConfigs() {
  const [prefData, elemData] = await Promise.all([
    fetchJson("./config/prefectures.json"),
    fetchJson("./config/elements.json"),
  ]);
  prefecturesConfig = prefData;
  elementsConfig = elemData;
}

async function loadManifest() {
  try {
    manifestCache = await fetchJson(`${BASE_RANKING_DIR}/manifest.json`);
  } catch (err) {
    console.error(err);
    manifestCache = null;
  }
}

function getPrefectures() {
  return prefecturesConfig?.prefectures || [];
}

function getRegions() {
  return [...new Set(getPrefectures().map((p) => p.region))];
}

function getPrefecturesInRegion(region) {
  return getPrefectures().filter((p) => p.region === region);
}

function populateRegions(preferredRegion = null) {
  const regions = getRegions();
  regionSelect.innerHTML = regions
    .map((region) => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    .join("");

  const defaultRegion =
    preferredRegion ||
    loadUIState()?.region ||
    elementsConfig?.defaultRegion ||
    FALLBACK_DEFAULTS.region;

  if (regions.includes(defaultRegion)) {
    regionSelect.value = defaultRegion;
  } else if (regions.length > 0) {
    regionSelect.value = regions[0];
  }
}

function populatePrefectures(preferredPrefKey = null) {
  const region = regionSelect.value;
  const list = getPrefecturesInRegion(region);

  prefSelect.innerHTML = list
    .map(
      (pref) =>
        `<option value="${escapeHtml(pref.key)}">${escapeHtml(pref.name)}</option>`
    )
    .join("");

  const defaultPref =
    preferredPrefKey ||
    loadUIState()?.pref ||
    elementsConfig?.defaultPref ||
    FALLBACK_DEFAULTS.pref;

  const availableKeys = list.map((p) => p.key);

  if (availableKeys.includes(defaultPref)) {
    prefSelect.value = defaultPref;
  } else if (availableKeys.length > 0) {
    prefSelect.value = availableKeys[0];
  }
}

function getActiveElementList() {
  if (!elementsConfig) return [];
  return monthSelect.value === "all"
    ? elementsConfig.annualElements || []
    : elementsConfig.monthlyElements || [];
}

function getDefaultElementKey() {
  if (!elementsConfig) {
    return monthSelect.value === "all"
      ? FALLBACK_DEFAULTS.annualElement
      : FALLBACK_DEFAULTS.monthlyElement;
  }
  return monthSelect.value === "all"
    ? elementsConfig.annualDefaultElement || FALLBACK_DEFAULTS.annualElement
    : elementsConfig.monthlyDefaultElement || FALLBACK_DEFAULTS.monthlyElement;
}

function getSelectedElementKey() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : getPreferredElementKeyForCurrentMonth();
}

function getSelectedElementMeta() {
  const key = getSelectedElementKey();
  return getActiveElementList().find((item) => item.key === key) || null;
}

function groupElements(list) {
  const grouped = new Map();
  for (const item of list) {
    const groupName = item.group || "その他";
    if (!grouped.has(groupName)) grouped.set(groupName, []);
    grouped.get(groupName).push(item);
  }
  return grouped;
}

function renderElementPanel(preferredKey = null) {
  const list = getActiveElementList();
  const defaultKey = getDefaultElementKey();
  let selectedKey = preferredKey || getPreferredElementKeyForCurrentMonth();

  if (!list.some((item) => item.key === selectedKey)) {
    selectedKey = list.some((item) => item.key === defaultKey)
      ? defaultKey
      : list[0]?.key || "";
  }

  if (list.length === 0) {
    elementPanel.innerHTML = `<div class="element-empty">要素定義がありません</div>`;
    return;
  }

  const grouped = groupElements(list);
  const html = [];

  for (const [groupName, items] of grouped.entries()) {
    html.push(`<section class="element-group">`);
    html.push(`<h3 class="element-group-title">${escapeHtml(groupName)}</h3>`);
    html.push(`<div class="element-grid">`);

    for (const item of items) {
      const checked = item.key === selectedKey ? "checked" : "";
      html.push(`
        <label class="element-option">
          <input type="radio" name="element" value="${escapeHtml(item.key)}" ${checked}>
          <span>${escapeHtml(item.shortLabel || item.label)}</span>
        </label>
      `);
    }

    html.push(`</div>`);
    html.push(`</section>`);
  }

  elementPanel.innerHTML = html.join("");

  document.querySelectorAll('input[name="element"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateSavedElementKeyForCurrentMonth(input.value);
      markScrollRestorePending();
      saveUIState();
      loadTable();
    });
  });
}

function makeTableHeader() {
  const cols = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i++) cols.push(`${i}位`);
  rankTableHead.innerHTML = `<tr>${cols.map((col) => `<th>${escapeHtml(col)}</th>`).join("")}</tr>`;
}

function renderTableRows(rows) {
  rankTableBody.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    rankTableBody.innerHTML = `<tr><td colspan="11">該当データがありません。</td></tr>`;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div class="station-name">${escapeHtml(row.stationName || "-")}</div>
      ${renderStartDateTwoLines(row.startDate || "-")}
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const rank = row.ranks?.[i];
      const td = document.createElement("td");

      if (!rank) {
        td.className = "rank-cell";
        td.innerHTML = `
          <div class="rank-value">-</div>
          <div class="rank-date-wrap">-</div>
        `;
      } else {
        const classes = ["rank-cell"];
        if (rank.highlightLive) classes.push("live-in-rank");
        if (rank.highlightWithinYear) classes.push("within-year");

        td.className = classes.join(" ");
        td.innerHTML = `
          <div class="rank-value">${escapeHtml(rank.value ?? "-")}</div>
          ${renderRankDateTwoLines(rank.date || "-")}
        `;
      }

      tr.appendChild(td);
    }

    rankTableBody.appendChild(tr);
  }
}

function buildElementOrderMap() {
  const merged = [
    ...(elementsConfig?.annualElements || []),
    ...(elementsConfig?.monthlyElements || []),
  ];
  const orderMap = new Map();
  let idx = 0;
  for (const item of merged) {
    if (!orderMap.has(item.key)) orderMap.set(item.key, idx++);
  }
  return orderMap;
}

function normalizeLiveItemsByObservedDate(items, observedLatestAt) {
  const observedYmd = parseObservedDate(observedLatestAt);
  if (!observedYmd) return [];
  return (Array.isArray(items) ? items : []).filter((item) => {
    const itemYmd = parseRankDateLabelToYmd(item.date);
    return itemYmd === observedYmd;
  });
}

function renderLiveSummaryColumn(title, items) {
  if (!items.length) {
    return `
      <div class="live-summary-col">
        <div class="live-summary-title">${escapeHtml(title)}</div>
        <div class="live-summary-empty">該当なし</div>
      </div>
    `;
  }

  return `
    <div class="live-summary-col">
      <div class="live-summary-title">${escapeHtml(title)}</div>
      <div class="live-summary-list">
        ${items
          .map(
            (item) => `
          <div class="live-summary-item">
            <div class="live-summary-rank">${escapeHtml(item.rank)}位</div>
            <div class="live-summary-element">${escapeHtml(
              item.elementLabel || item.elementKey || ""
            )}</div>
            <div class="live-summary-station">${escapeHtml(item.stationName || "")}</div>
            <div class="live-summary-value">${escapeHtml(item.value ?? "")}</div>
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderLiveSummary(summary) {
  const rawAnnualItems = Array.isArray(summary?.annualItems) ? summary.annualItems : [];
  const rawMonthlyItems = Array.isArray(summary?.monthlyItems) ? summary.monthlyItems : [];

  const annualItems = normalizeLiveItemsByObservedDate(
    rawAnnualItems,
    summary?.observedLatestAt
  );
  const monthlyItems = normalizeLiveItemsByObservedDate(
    rawMonthlyItems,
    summary?.observedLatestAt
  );

  const orderMap = buildElementOrderMap();
  const sorter = (a, b) => {
    const oa = orderMap.has(a.elementKey) ? orderMap.get(a.elementKey) : 9999;
    const ob = orderMap.has(b.elementKey) ? orderMap.get(b.elementKey) : 9999;
    if (oa !== ob) return oa - ob;
    if ((a.rank ?? 9999) !== (b.rank ?? 9999)) return (a.rank ?? 9999) - (b.rank ?? 9999);
    return String(a.stationName || "").localeCompare(String(b.stationName || ""), "ja");
  };

  const annualSorted = [...annualItems].sort(sorter);
  const monthlySorted = [...monthlyItems].sort(sorter);

  liveSummaryBody.innerHTML = `
    <div class="live-summary-grid">
      ${renderLiveSummaryColumn("通年", annualSorted)}
      ${renderLiveSummaryColumn("当月", monthlySorted)}
    </div>
  `;

  const hasAny = annualSorted.length > 0 || monthlySorted.length > 0;
  const hasTop1 =
    annualSorted.some((item) => Number(item.rank) === 1) ||
    monthlySorted.some((item) => Number(item.rank) === 1);

  setBadgeVisible(rankInBadge, hasAny);
  setBadgeVisible(topRankAlert, hasTop1);
  observedLatestAtEl.textContent = formatDateTime(summary?.observedLatestAt || "");
}

async function loadLiveSummary(prefKey) {
  try {
    const summary = await fetchJson(`${LIVE_DATA_DIR}/${prefKey}/live-summary.json`);
    renderLiveSummary(summary);
  } catch (err) {
    console.warn("live-summary.json がまだ無いため、実況一覧は空表示にします。", err);
    liveSummaryBody.innerHTML = `
      <div class="live-summary-grid">
        <div class="live-summary-col">
          <div class="live-summary-title">通年</div>
          <div class="live-summary-empty">該当なし</div>
        </div>
        <div class="live-summary-col">
          <div class="live-summary-title">当月</div>
          <div class="live-summary-empty">該当なし</div>
        </div>
      </div>
    `;
    setBadgeVisible(rankInBadge, false);
    setBadgeVisible(topRankAlert, false);
    observedLatestAtEl.textContent = "-";
  }
}

function getSelectedPrefMeta() {
  return getPrefectures().find((p) => p.key === prefSelect.value) || null;
}

function renderDebug(items) {
  debugGrid.innerHTML = items
    .map(
      (item) => `
      <div class="debug-item">
        <div class="debug-label">${escapeHtml(item.label)}</div>
        <div class="debug-value">${escapeHtml(item.value)}</div>
      </div>
    `
    )
    .join("");
}

async function loadTable() {
  const pref = getSelectedPrefMeta();
  const elementMeta = getSelectedElementMeta();
  const elementKey = elementMeta?.key || getSelectedElementKey();
  const month = monthSelect.value;

  const jsonPath = `${BASE_RANKING_DIR}/${prefSelect.value}/${elementKey}-${month}.json`;

  await loadManifest();

  if (!pref) {
    statusBox.textContent = "都道府県情報が見つかりません。";
    return;
  }

  await loadLiveSummary(pref.key);

  statusBox.textContent = `${pref.name} / ${
    month === "all" ? "通年" : `${month}月`
  } / ${elementMeta?.shortLabel || elementMeta?.label || elementKey}`;

  try {
    const data = await fetchJson(jsonPath);

    makeTableHeader();
    renderTableRows(data.rows || []);

    renderDebug([
      { label: "都道府県", value: pref.name },
      { label: "地域", value: pref.region || "-" },
      { label: "月", value: month === "all" ? "通年" : `${month}月` },
      { label: "要素キー", value: elementKey },
      { label: "要素名", value: elementMeta?.label || "-" },
      { label: "JSON", value: jsonPath },
      { label: "地点数", value: String(Array.isArray(data.rows) ? data.rows.length : 0) },
      {
        label: "manifest更新時刻",
        value: manifestCache?.updatedAt ? formatDateTime(manifestCache.updatedAt) : "-",
      },
      {
        label: "manifest観測時刻",
        value: manifestCache?.observedLatestAt
          ? formatDateTime(manifestCache.observedLatestAt)
          : "-",
      },
    ]);
  } catch (err) {
    console.error(err);
    makeTableHeader();
    renderTableRows([]);
    statusBox.textContent = `${pref.name} / ${
      month === "all" ? "通年" : `${month}月`
    } / ${elementMeta?.shortLabel || elementMeta?.label || elementKey} / 読み込み失敗`;

    renderDebug([
      { label: "都道府県", value: pref.name },
      { label: "月", value: month === "all" ? "通年" : `${month}月` },
      { label: "要素キー", value: elementKey },
      { label: "JSON", value: jsonPath },
      { label: "エラー", value: String(err.message || err) },
    ]);
  } finally {
    if (restoreScrollPending) {
      restoreScrollPosition();
    }
    saveUIState();
  }
}

function handleMonthChange() {
  const preferred = getPreferredElementKeyForCurrentMonth();
  renderElementPanel(preferred);
  markScrollRestorePending();
  saveUIState();
  loadTable();
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    markScrollRestorePending();
    saveUIState();
    loadTable();
  }, 10 * 60 * 1000);
}

function bindElementPanelToggle() {
  if (!elementPanelToggle) return;
  elementPanelToggle.addEventListener("click", () => {
    const open = !isElementPanelOpen();
    setElementPanelOpen(open);
    saveUIState();
  });
}

async function init() {
  makeTableHeader();
  await loadConfigs();

  const saved = loadUIState();

  populateRegions(saved?.region || elementsConfig?.defaultRegion || FALLBACK_DEFAULTS.region);
  populatePrefectures(saved?.pref || elementsConfig?.defaultPref || FALLBACK_DEFAULTS.pref);

  const monthCandidates = ["all", ...Array.from({ length: 12 }, (_, i) => String(i + 1))];
  const preferredMonth = saved?.month || elementsConfig?.defaultMonth || FALLBACK_DEFAULTS.month;
  monthSelect.value = monthCandidates.includes(preferredMonth)
    ? preferredMonth
    : FALLBACK_DEFAULTS.month;

  renderElementPanel(getPreferredElementKeyForCurrentMonth());

  const panelOpen = typeof saved?.elementPanelOpen === "boolean" ? saved.elementPanelOpen : true;
  setElementPanelOpen(panelOpen);

  bindElementPanelToggle();

  regionSelect.addEventListener("change", () => {
    const savedNow = loadUIState();
    const preferredPref = savedNow?.pref || elementsConfig?.defaultPref || FALLBACK_DEFAULTS.pref;
    populatePrefectures(preferredPref);
    markScrollRestorePending();
    saveUIState();
    loadTable();
  });

  prefSelect.addEventListener("change", () => {
    markScrollRestorePending();
    saveUIState();
    loadTable();
  });

  monthSelect.addEventListener("change", () => {
    handleMonthChange();
  });

  window.addEventListener(
    "scroll",
    () => {
      saveUIState();
    },
    { passive: true }
  );

  window.addEventListener("beforeunload", () => {
    saveUIState();
  });

  if (!restoredInitialScroll) {
    restoredInitialScroll = true;
    markScrollRestorePending();
  }

  await loadTable();
  restoreScrollPosition(true);
  startAutoRefresh();
}

init().catch((err) => {
  console.error(err);
  statusBox.textContent = `初期化に失敗しました: ${err.message || err}`;
});
