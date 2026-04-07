const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");

const topRankAlert = document.getElementById("topRankAlert");
const rankInBadge = document.getElementById("rankInBadge");
const observedLatestAtEl = document.getElementById("observedLatestAt");

const liveSummaryBody = document.getElementById("liveSummaryBody");
const elementPanel = document.getElementById("elementPanel");

const statusBox = document.getElementById("statusBox");
const rankTableHead = document.getElementById("rankTableHead");
const rankTableBody = document.getElementById("rankTableBody");
const debugGrid = document.getElementById("debugGrid");

let prefecturesConfig = null;
let elementsConfig = null;
let manifestCache = null;
let refreshTimer = null;

const FALLBACK_DEFAULTS = {
  region: "近畿",
  pref: "osaka",
  month: "all",
  annualElement: "dailyPrecip",
  monthlyElement: "dailyPrecip"
};

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
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function splitJapaneseDateLines(text) {
  if (!text) {
    return { first: "-", second: "", third: "" };
  }

  const raw = String(text).trim();

  const m1 = raw.match(/^(\d{4}年\d{1,2}月\d{1,2}日)（(.+)）$/);
  if (m1) {
    return {
      first: m1[1],
      second: `（${m1[2]}）`,
      third: ""
    };
  }

  const m2 = raw.match(/^(\d{4}年\d{1,2}月)（(.+)）$/);
  if (m2) {
    return {
      first: m2[1],
      second: `（${m2[2]}）`,
      third: ""
    };
  }

  return {
    first: raw,
    second: "",
    third: ""
  };
}

function renderStartDateTwoLines(text) {
  const lines = splitJapaneseDateLines(text);
  if (!lines.second) {
    return `<div>${escapeHtml(lines.first)}</div>`;
  }
  return `<div>${escapeHtml(lines.first)}</div><div>${escapeHtml(lines.second)}</div>`;
}

function renderRankDateTwoLines(text) {
  const lines = splitJapaneseDateLines(text);
  return `
    <div class="rank-date-line rank-date-western">${escapeHtml(lines.first || "-")}</div>
    <div class="rank-date-line rank-date-wareki">${escapeHtml(lines.second || "")}</div>
  `;
}

function parseObservedDate(isoText) {
  if (!isoText) return null;
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseRankDateLabelToYmd(label) {
  if (!label) return null;
  const m = String(label).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[3])).padStart(2, "0")}`;
}

async function fetchJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${path} の取得に失敗しました: HTTP ${res.status}`);
  }
  return await res.json();
}

async function loadConfigs() {
  const [prefData, elemData] = await Promise.all([
    fetchJson("./config/prefectures.json"),
    fetchJson("./config/elements.json")
  ]);
  prefecturesConfig = prefData;
  elementsConfig = elemData;
}

async function loadManifest() {
  try {
    manifestCache = await fetchJson("./data/manifest.json");
  } catch (err) {
    console.error(err);
    manifestCache = null;
  }
}

function getPrefectures() {
  return prefecturesConfig?.prefectures || [];
}

function getRegions() {
  return [...new Set(getPrefectures().map(p => p.region))];
}

function getPrefecturesInRegion(region) {
  return getPrefectures().filter(p => p.region === region);
}

function populateRegions() {
  const regions = getRegions();
  regionSelect.innerHTML = regions
    .map(region => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    .join("");

  const defaultRegion = elementsConfig?.defaultRegion || FALLBACK_DEFAULTS.region;
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
    .map(pref => `<option value="${escapeHtml(pref.key)}">${escapeHtml(pref.name)}</option>`)
    .join("");

  const defaultPref = preferredPrefKey || elementsConfig?.defaultPref || FALLBACK_DEFAULTS.pref;
  const availableKeys = list.map(p => p.key);

  if (availableKeys.includes(defaultPref)) {
    prefSelect.value = defaultPref;
  } else if (availableKeys.length > 0) {
    prefSelect.value = availableKeys[0];
  }
}

function getActiveElementList() {
  if (!elementsConfig) return [];
  return monthSelect.value === "all"
    ? (elementsConfig.annualElements || [])
    : (elementsConfig.monthlyElements || []);
}

function getDefaultElementKey() {
  if (!elementsConfig) {
    return monthSelect.value === "all"
      ? FALLBACK_DEFAULTS.annualElement
      : FALLBACK_DEFAULTS.monthlyElement;
  }
  return monthSelect.value === "all"
    ? (elementsConfig.annualDefaultElement || FALLBACK_DEFAULTS.annualElement)
    : (elementsConfig.monthlyDefaultElement || FALLBACK_DEFAULTS.monthlyElement);
}

function getSelectedElementKey() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : getDefaultElementKey();
}

function getSelectedElementMeta() {
  const key = getSelectedElementKey();
  return getActiveElementList().find(item => item.key === key) || null;
}

function groupElements(list) {
  const grouped = new Map();
  for (const item of list) {
    const groupName = item.group || "その他";
    if (!grouped.has(groupName)) {
      grouped.set(groupName, []);
    }
    grouped.get(groupName).push(item);
  }
  return grouped;
}

function renderElementPanel(preferredKey = null) {
  const list = getActiveElementList();
  const defaultKey = getDefaultElementKey();
  let selectedKey = preferredKey || getSelectedElementKey();

  if (!list.some(item => item.key === selectedKey)) {
    selectedKey = list.some(item => item.key === defaultKey)
      ? defaultKey
      : (list[0]?.key || "");
  }

  if (list.length === 0) {
    elementPanel.innerHTML = `<div class="live-summary-empty">要素定義がありません</div>`;
    return;
  }

  const grouped = groupElements(list);
  const html = [];

  for (const [groupName, items] of grouped.entries()) {
    html.push(`<section class="element-group">`);
    html.push(`<div class="element-group-title">${escapeHtml(groupName)}</div>`);
    html.push(`<div class="element-group-grid">`);

    for (const item of items) {
      html.push(`
        <label class="element-option">
          <input type="radio" name="element" value="${escapeHtml(item.key)}" ${item.key === selectedKey ? "checked" : ""}>
          <span class="element-option-text">${escapeHtml(item.shortLabel || item.label)}</span>
        </label>
      `);
    }

    html.push(`</div>`);
    html.push(`</section>`);
  }

  elementPanel.innerHTML = html.join("");

  document.querySelectorAll('input[name="element"]').forEach(input => {
    input.addEventListener("change", () => {
      loadTable();
    });
  });
}

function makeTableHeader() {
  const cols = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i++) cols.push(`${i}位`);

  rankTableHead.innerHTML = `
    <tr>
      ${cols.map(col => `<th>${escapeHtml(col)}</th>`).join("")}
    </tr>
  `;
}

function renderTableRows(rows) {
  rankTableBody.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    rankTableBody.innerHTML = `
      <tr>
        <td colspan="11">該当データがありません。</td>
      </tr>
    `;
    return;
  }

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div class="station-name">${escapeHtml(row.stationName || "-")}</div>
      <div class="station-start-date">${renderStartDateTwoLines(row.startDate || "-")}</div>
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const rank = row.ranks?.[i];
      const td = document.createElement("td");

      if (!rank) {
        td.className = "rank-cell";
        td.innerHTML = `
          <div class="rank-value">-</div>
          <div class="rank-date-block">
            <div class="rank-date-line">-</div>
            <div class="rank-date-line"></div>
          </div>
        `;
      } else {
        const classes = ["rank-cell"];
        if (rank.highlightLive) classes.push("live-in-rank");
        if (rank.highlightWithinYear) classes.push("within-year");
        td.className = classes.join(" ");
        td.innerHTML = `
          <div class="rank-value">${escapeHtml(rank.value ?? "-")}</div>
          <div class="rank-date-block">
            ${renderRankDateTwoLines(rank.date || "-")}
          </div>
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
    ...(elementsConfig?.monthlyElements || [])
  ];

  const orderMap = new Map();
  let idx = 0;
  for (const item of merged) {
    if (!orderMap.has(item.key)) {
      orderMap.set(item.key, idx++);
    }
  }
  return orderMap;
}

function normalizeLiveItemsByObservedDate(items, observedLatestAt) {
  const observedYmd = parseObservedDate(observedLatestAt);
  if (!observedYmd) return [];

  return (Array.isArray(items) ? items : []).filter(item => {
    const itemYmd = parseRankDateLabelToYmd(item.date);
    return itemYmd === observedYmd;
  });
}

function renderLiveSummaryColumn(title, items) {
  if (!items.length) {
    return `
      <div class="live-summary-col">
        <div class="live-summary-col-title">${escapeHtml(title)}</div>
        <div class="live-summary-empty">該当なし</div>
      </div>
    `;
  }

  return `
    <div class="live-summary-col">
      <div class="live-summary-col-title">${escapeHtml(title)}</div>
      <div class="live-summary-list">
        ${items.map(item => `
          <div class="live-summary-item">
            <div class="live-summary-rank">${escapeHtml(item.rank)}位</div>
            <div class="live-summary-element">${escapeHtml(item.elementLabel || item.elementKey || "")}</div>
            <div class="live-summary-station">${escapeHtml(item.stationName || "")}</div>
            <div class="live-summary-value">${escapeHtml(item.value ?? "")}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderLiveSummary(summary) {
  const rawAnnualItems = Array.isArray(summary?.annualItems) ? summary.annualItems : [];
  const rawMonthlyItems = Array.isArray(summary?.monthlyItems) ? summary.monthlyItems : [];

  const annualItems = normalizeLiveItemsByObservedDate(rawAnnualItems, summary?.observedLatestAt);
  const monthlyItems = normalizeLiveItemsByObservedDate(rawMonthlyItems, summary?.observedLatestAt);

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
  rankInBadge.hidden = !hasAny;
  rankInBadge.setAttribute("aria-hidden", String(!hasAny));

  const hasTop1 = annualSorted.some(item => Number(item.rank) === 1) || monthlySorted.some(item => Number(item.rank) === 1);
  topRankAlert.hidden = !hasTop1;
  topRankAlert.setAttribute("aria-hidden", String(!hasTop1));

  observedLatestAtEl.textContent = formatDateTime(summary?.observedLatestAt || "");
}

async function loadLiveSummary(prefKey) {
  try {
    const summary = await fetchJson(`./data/${prefKey}/live-summary.json`);
    renderLiveSummary(summary);
  } catch (err) {
    console.error(err);
    liveSummaryBody.innerHTML = `<div class="live-summary-empty">実況一覧の読み込みに失敗しました</div>`;
    rankInBadge.hidden = true;
    rankInBadge.setAttribute("aria-hidden", "true");
    topRankAlert.hidden = true;
    topRankAlert.setAttribute("aria-hidden", "true");
    observedLatestAtEl.textContent = "-";
  }
}

function getSelectedPrefMeta() {
  return getPrefectures().find(p => p.key === prefSelect.value) || null;
}

function renderDebug(items) {
  debugGrid.innerHTML = items.map(item => `
    <div><strong>${escapeHtml(item.label)}</strong></div>
    <div>${escapeHtml(item.value)}</div>
  `).join("");
}

async function loadTable() {
  const pref = getSelectedPrefMeta();
  const elementMeta = getSelectedElementMeta();
  const elementKey = elementMeta?.key || getSelectedElementKey();
  const month = monthSelect.value;
  const jsonPath = `./data/${prefSelect.value}/${elementKey}-${month}.json`;

  await loadManifest();

  if (!pref) {
    statusBox.textContent = "都道府県情報が見つかりません。";
    return;
  }

  await loadLiveSummary(pref.key);

  statusBox.textContent = "読み込み中...";

  try {
    const data = await fetchJson(jsonPath);
    makeTableHeader();
    renderTableRows(data.rows || []);

    statusBox.textContent = `${pref.name} / ${month === "all" ? "通年" : `${month}月`} / ${elementMeta?.shortLabel || elementMeta?.label || elementKey}`;

    renderDebug([
      { label: "都道府県", value: pref.name },
      { label: "地域", value: pref.region || "-" },
      { label: "月", value: month === "all" ? "通年" : `${month}月` },
      { label: "要素キー", value: elementKey },
      { label: "要素名", value: elementMeta?.label || "-" },
      { label: "JSON", value: jsonPath },
      { label: "地点数", value: String(Array.isArray(data.rows) ? data.rows.length : 0) },
      { label: "manifest更新時刻", value: manifestCache?.updatedAt ? formatDateTime(manifestCache.updatedAt) : "-" },
      { label: "manifest観測時刻", value: manifestCache?.observedLatestAt ? formatDateTime(manifestCache.observedLatestAt) : "-" }
    ]);
  } catch (err) {
    console.error(err);
    makeTableHeader();
    renderTableRows([]);
    statusBox.textContent = `読み込み失敗: ${err.message || err}`;

    renderDebug([
      { label: "都道府県", value: pref.name },
      { label: "月", value: month === "all" ? "通年" : `${month}月` },
      { label: "要素キー", value: elementKey },
      { label: "JSON", value: jsonPath },
      { label: "エラー", value: String(err.message || err) }
    ]);
  }
}

function handleMonthChange() {
  const previous = getSelectedElementKey();
  renderElementPanel(previous);
  loadTable();
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadTable();
  }, 10 * 60 * 1000);
}

async function init() {
  makeTableHeader();
  await loadConfigs();

  populateRegions();
  populatePrefectures();

  monthSelect.value = elementsConfig?.defaultMonth || FALLBACK_DEFAULTS.month;
  renderElementPanel(getDefaultElementKey());

  regionSelect.addEventListener("change", () => {
    populatePrefectures();
    loadTable();
  });

  prefSelect.addEventListener("change", () => {
    loadTable();
  });

  monthSelect.addEventListener("change", () => {
    handleMonthChange();
  });

  await loadTable();
  startAutoRefresh();
}

init().catch(err => {
  console.error(err);
  statusBox.textContent = `初期化に失敗しました: ${err.message || err}`;
});
