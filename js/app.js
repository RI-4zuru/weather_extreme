const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const liveSummaryEl = document.getElementById("liveSummary");
const observedLatestAtEl = document.getElementById("observedLatestAt");
const liveRankBadge = document.getElementById("liveRankBadge");
const recordTopBadge = document.getElementById("recordTopBadge");
const elementOptionsEl = document.getElementById("elementOptions");
const elementToggleBtn = document.getElementById("elementToggle");

let refreshTimer = null;
let manifestCache = null;
let prefecturesData = [];
let elementsConfig = null;
let elementPanelOpen = true;

const DEFAULTS = {
  region: "近畿",
  pref: "osaka",
  month: "all",
  annualElement: "dailyPrecip",
  monthlyElement: "dailyPrecip"
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDualLine(text) {
  if (!text) return "-";
  const parts = String(text).split("（");
  const first = parts[0] || "-";
  const second = parts[1] ? "（" + parts[1] : "";
  return `${escapeHtml(first)}<br>${escapeHtml(second)}`;
}

function formatDateTime(isoText, suffix = "") {
  if (!isoText) return "-";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return String(isoText);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}${suffix}`;
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
      ? DEFAULTS.annualElement
      : DEFAULTS.monthlyElement;
  }
  return monthSelect.value === "all"
    ? (elementsConfig.annualDefaultElement || DEFAULTS.annualElement)
    : (elementsConfig.monthlyDefaultElement || DEFAULTS.monthlyElement);
}

function getElementMeta(key) {
  const list = getActiveElementList();
  return list.find(item => item.key === key) || null;
}

function getSelectedElement() {
  const checked = document.querySelector('input[name="element"]:checked');
  if (checked) return checked.value;
  return getDefaultElementKey();
}

function getSelectedElementLabel() {
  const meta = getElementMeta(getSelectedElement());
  return meta ? meta.label : getSelectedElement();
}

function buildElementOrder() {
  const annual = elementsConfig?.annualElements || [];
  const monthly = elementsConfig?.monthlyElements || [];
  const merged = [...annual, ...monthly];
  const order = [];
  for (const item of merged) {
    if (!order.includes(item.key)) {
      order.push(item.key);
    }
  }
  return order;
}

async function loadPrefectures() {
  const res = await fetch(`./config/prefectures.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`prefectures.json の取得に失敗しました: HTTP ${res.status}`);
  }
  const data = await res.json();
  prefecturesData = data.prefectures || [];
}

async function loadElementsConfig() {
  const res = await fetch(`./config/elements.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`elements.json の取得に失敗しました: HTTP ${res.status}`);
  }
  elementsConfig = await res.json();
}

async function loadManifest() {
  try {
    const res = await fetch(`./data/manifest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`manifest.json の取得に失敗しました: HTTP ${res.status}`);
    }
    manifestCache = await res.json();
  } catch (err) {
    console.error(err);
    manifestCache = null;
  }
}

function populateRegions() {
  const regions = [...new Set(prefecturesData.map(p => p.region))];
  regionSelect.innerHTML = regions
    .map(region => `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`)
    .join("");

  const defaultRegion = elementsConfig?.defaultRegion || DEFAULTS.region;
  if (regions.includes(defaultRegion)) {
    regionSelect.value = defaultRegion;
  }
}

function populatePrefectures() {
  const region = regionSelect.value;
  const list = prefecturesData.filter(p => p.region === region);

  prefSelect.innerHTML = list
    .map(pref => `<option value="${escapeHtml(pref.key)}">${escapeHtml(pref.name)}</option>`)
    .join("");

  const defaultPref = elementsConfig?.defaultPref || DEFAULTS.pref;
  if ([...prefSelect.options].some(opt => opt.value === defaultPref)) {
    prefSelect.value = defaultPref;
  }
}

function getSelectedPrefMeta() {
  return prefecturesData.find(p => p.key === prefSelect.value) || null;
}

function renderElementOptions(preferredKey = null) {
  const list = getActiveElementList();
  const defaultKey = getDefaultElementKey();
  const currentKey = preferredKey || getSelectedElement();

  let selectedKey = currentKey;
  if (!list.some(item => item.key === selectedKey)) {
    selectedKey = list.some(item => item.key === defaultKey)
      ? defaultKey
      : (list[0]?.key || "");
  }

  elementOptionsEl.innerHTML = list.map(item => {
    const checked = item.key === selectedKey ? "checked" : "";
    return `
      <label class="element-option">
        <input type="radio" name="element" value="${escapeHtml(item.key)}" ${checked}>
        <span>${escapeHtml(item.label)}<br><small>(${escapeHtml(item.unit)})</small></span>
      </label>
    `;
  }).join("");

  document.querySelectorAll('input[name="element"]').forEach(el => {
    el.addEventListener("change", loadTable);
  });
}

function makeHeader() {
  const cols = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i++) {
    cols.push(`${i}位`);
  }

  tableHead.innerHTML = `
    <tr>
      ${cols.map(c => `<th>${escapeHtml(c)}</th>`).join("")}
    </tr>
  `;
}

function renderTable(rows) {
  tableBody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div>${escapeHtml(row.stationName || "-")}</div>
      <div>${renderDualLine(row.startDate || "-")}</div>
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const rankData = row.ranks?.[i];
      const td = document.createElement("td");

      if (rankData) {
        const classes = ["rank-cell"];
        if (rankData.highlightLive) classes.push("live-in-rank");
        if (rankData.highlightWithinYear) classes.push("within-year");
        td.className = classes.join(" ");
        td.innerHTML = `
          <div>${escapeHtml(rankData.value ?? "-")}</div>
          <div>${renderDualLine(rankData.date || "-")}</div>
        `;
      } else {
        td.className = "rank-cell";
        td.innerHTML = `
          <div>-</div>
          <div>-</div>
        `;
      }

      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }
}

function renderLiveColumn(title, data) {
  if (!data || data.length === 0) {
    return `
      <div class="live-column">
        <h3>${escapeHtml(title)}</h3>
        <p>該当なし</p>
      </div>
    `;
  }

  const cards = data.map(item => `
    <div class="live-item">
      <strong>${escapeHtml(String(item.rank))}位</strong>
      <span>${escapeHtml(item.elementLabel || item.elementKey || "")}</span>
      <span>${escapeHtml(item.stationName || "")}</span>
      <strong>${escapeHtml(String(item.value ?? ""))}</strong>
    </div>
  `).join("");

  return `
    <div class="live-column">
      <h3>${escapeHtml(title)}</h3>
      ${cards}
    </div>
  `;
}

function renderLiveSummary(summary) {
  const annualItems = Array.isArray(summary?.annualItems) ? summary.annualItems : [];
  const monthlyItems = Array.isArray(summary?.monthlyItems) ? summary.monthlyItems : [];

  const oldItems = Array.isArray(summary?.items) ? summary.items : [];
  const compatibleAnnual = annualItems.length || monthlyItems.length
    ? annualItems
    : oldItems.filter(item => item.monthLabel === "通年");
  const compatibleMonthly = annualItems.length || monthlyItems.length
    ? monthlyItems
    : oldItems.filter(item => item.monthLabel !== "通年");

  const order = buildElementOrder();
  const sorter = (a, b) => {
    const oa = order.indexOf(a.elementKey);
    const ob = order.indexOf(b.elementKey);
    const va = oa === -1 ? 9999 : oa;
    const vb = ob === -1 ? 9999 : ob;

    if (va !== vb) return va - vb;
    if ((a.rank ?? 9999) !== (b.rank ?? 9999)) return (a.rank ?? 9999) - (b.rank ?? 9999);
    return String(a.stationName || "").localeCompare(String(b.stationName || ""), "ja");
  };

  const annualSorted = [...compatibleAnnual].sort(sorter);
  const monthlySorted = [...compatibleMonthly].sort(sorter);

  liveSummaryEl.innerHTML = `
    <div class="live-columns">
      ${renderLiveColumn("通年", annualSorted)}
      ${renderLiveColumn("当月", monthlySorted)}
    </div>
  `;

  const hasAny = annualSorted.length > 0 || monthlySorted.length > 0;
  liveRankBadge.hidden = !hasAny;

  const hasAnnualTop1 = annualSorted.some(item => Number(item.rank) === 1);
  recordTopBadge.hidden = !hasAnnualTop1;

  observedLatestAtEl.textContent = formatDateTime(summary?.observedLatestAt || "", "");
}

async function loadLiveSummary(prefKey) {
  try {
    const res = await fetch(`./data/${prefKey}/live-summary.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`live-summary.json の取得に失敗しました: HTTP ${res.status}`);
    }
    const data = await res.json();
    renderLiveSummary(data);
  } catch (err) {
    console.error(err);
    liveSummaryEl.innerHTML = `<p>実況一覧の読み込みに失敗しました。</p>`;
    observedLatestAtEl.textContent = "-";
    liveRankBadge.hidden = true;
    recordTopBadge.hidden = true;
  }
}

function buildStatusText({ prefName, elementLabel, jsonPath, rowCount, errorText = "" }) {
  const parts = [];

  if (manifestCache?.updatedAt) {
    parts.push(`manifest更新: ${formatDateTime(manifestCache.updatedAt, " 更新")}`);
  }
  if (manifestCache?.observedLatestAt) {
    parts.push(`manifest観測時刻: ${formatDateTime(manifestCache.observedLatestAt)}`);
  }
  if (prefName) {
    parts.push(`都道府県: ${prefName}`);
  }
  if (monthSelect.value) {
    parts.push(`月: ${monthSelect.value === "all" ? "通年" : `${monthSelect.value}月`}`);
  }
  if (elementLabel) {
    parts.push(`要素: ${elementLabel}`);
  }
  if (jsonPath) {
    parts.push(`JSON: ${jsonPath}`);
  }
  if (typeof rowCount === "number") {
    parts.push(`地点数: ${rowCount}`);
  }
  if (errorText) {
    parts.push(`エラー: ${errorText}`);
  }

  return parts.join(" / ");
}

async function loadTable() {
  const prefMeta = getSelectedPrefMeta();
  const prefKey = prefSelect.value;
  const elementKey = getSelectedElement();
  const month = monthSelect.value;
  const elementLabel = getSelectedElementLabel();
  const jsonPath = `./data/${prefKey}/${elementKey}-${month}.json`;

  await loadManifest();

  if (!prefMeta) {
    statusEl.textContent = "都道府県情報が見つかりません。";
    tableBody.innerHTML = "";
    liveSummaryEl.innerHTML = "<p>実況一覧を表示できません。</p>";
    return;
  }

  await loadLiveSummary(prefKey);

  if (!prefMeta.stationsFile) {
    tableBody.innerHTML = "";
    statusEl.textContent = buildStatusText({
      prefName: prefMeta.name,
      elementLabel,
      jsonPath,
      rowCount: 0,
      errorText: "未対応"
    });
    return;
  }

  statusEl.textContent = "読み込み中...";

  try {
    const res = await fetch(`${jsonPath}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    makeHeader();
    renderTable(data.rows || []);
    statusEl.textContent = buildStatusText({
      prefName: prefMeta.name,
      elementLabel,
      jsonPath,
      rowCount: Array.isArray(data.rows) ? data.rows.length : 0
    });
  } catch (err) {
    console.error(err);
    tableBody.innerHTML = "";
    statusEl.textContent = buildStatusText({
      prefName: prefMeta.name,
      elementLabel,
      jsonPath,
      rowCount: 0,
      errorText: String(err.message || err)
    });
  }
}

function handleMonthChange() {
  const prevElement = getSelectedElement();
  renderElementOptions(prevElement);
  loadTable();
}

function setupElementToggle() {
  elementToggleBtn.addEventListener("click", () => {
    elementPanelOpen = !elementPanelOpen;
    elementOptionsEl.hidden = !elementPanelOpen;
    elementToggleBtn.setAttribute("aria-expanded", String(elementPanelOpen));
  });
}

function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(loadTable, 10 * 60 * 1000);
}

async function init() {
  makeHeader();

  await Promise.all([
    loadPrefectures(),
    loadElementsConfig()
  ]);

  populateRegions();
  populatePrefectures();

  monthSelect.value = elementsConfig?.defaultMonth || DEFAULTS.month;

  renderElementOptions(getDefaultElementKey());
  setupElementToggle();

  regionSelect.addEventListener("change", async () => {
    populatePrefectures();
    await loadTable();
  });

  prefSelect.addEventListener("change", loadTable);
  monthSelect.addEventListener("change", handleMonthChange);

  await loadTable();
  startAutoRefresh();
}

init().catch(err => {
  console.error(err);
  statusEl.textContent = `初期化に失敗しました: ${err.message || err}`;
});
