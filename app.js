const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const liveSummaryEl = document.getElementById("liveSummary");

let refreshTimer = null;
let manifestCache = null;
let prefecturesData = [];

const ELEMENT_LABELS = {
  dailyPrecip: "日降水量",
  max10mPrecip: "日最大10分間降水量",
  max1hPrecip: "日最大1時間降水量",
  monthMax1h10mPrecip: "日最大1時間降水量(10分間隔)の多い方から",
  monthMax3hPrecip: "月最大3時間降水量の多い方から",
  monthMax6hPrecip: "月最大6時間降水量の多い方から",
  monthMax12hPrecip: "月最大12時間降水量の多い方から",
  monthMax24hPrecip: "月最大24時間降水量の多い方から",
  monthMax48hPrecip: "月最大48時間降水量の多い方から",
  monthMax72hPrecip: "月最大72時間降水量の多い方から",
  monthPrecipHigh: "月降水量の多い方から",
  monthPrecipLow: "月降水量の少ない方から",
  dailyMaxTempHigh: "日最高気温の高い方から",
  dailyMaxTempLow: "日最高気温の低い方から",
  dailyMinTempHigh: "日最低気温の高い方から",
  dailyMinTempLow: "日最低気温の低い方から",
  monthAvgTempHigh: "月平均気温の高い方から",
  monthAvgTempLow: "月平均気温の低い方から",
  dailyMinHumidity: "日最小相対湿度",
  dailyMaxWind: "日最大風速",
  dailyMaxGust: "日最大瞬間風速",
  monthSunshineHigh: "月間日照時間の多い方から",
  monthSunshineLow: "月間日照時間の少ない方から",
  dailySnowDepth: "降雪の深さ日合計",
  monthSnowDepth: "降雪の深さ月合計",
  monthMax3hSnow: "月最大3時間降雪量の多い方から",
  monthMax6hSnow: "月最大6時間降雪量の多い方から",
  monthMax12hSnow: "月最大12時間降雪量の多い方から",
  monthMax24hSnow: "月最大24時間降雪量の多い方から",
  monthMax48hSnow: "月最大48時間降雪量の多い方から",
  monthMax72hSnow: "月最大72時間降雪量の多い方から",
  monthDeepSnowHigh: "月最深積雪の大きい方から",
  monthDeepSnowLow: "月最深積雪の小さい方から"
};

const DEFAULT_REGION = "近畿";
const DEFAULT_PREF = "osaka";
const DEFAULT_MONTH = "all";
const DEFAULT_ELEMENT = "dailyPrecip";

function getSelectedElement() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : DEFAULT_ELEMENT;
}

function getSelectedElementLabel() {
  return ELEMENT_LABELS[getSelectedElement()] || getSelectedElement();
}

async function initPrefectures() {
  const res = await fetch("./config/prefectures.json?t=" + Date.now(), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = await res.json();
  prefecturesData = data.prefectures || [];

  const regions = [...new Set(prefecturesData.map(p => p.region))];
  regionSelect.innerHTML = regions
    .map(region => `<option value="${region}">${region}</option>`)
    .join("");

  if (regions.includes(DEFAULT_REGION)) {
    regionSelect.value = DEFAULT_REGION;
  }

  populatePrefectures();

  if ([...prefSelect.options].some(opt => opt.value === DEFAULT_PREF)) {
    prefSelect.value = DEFAULT_PREF;
  }

  monthSelect.value = DEFAULT_MONTH;

  const defaultRadio = document.querySelector(`input[name="element"][value="${DEFAULT_ELEMENT}"]`);
  if (defaultRadio) {
    defaultRadio.checked = true;
  }
}

function populatePrefectures() {
  const region = regionSelect.value;
  const list = prefecturesData.filter(p => p.region === region);
  prefSelect.innerHTML = list
    .map(pref => `<option value="${pref.key}">${pref.name}</option>`)
    .join("");
}

function getSelectedPrefMeta() {
  return prefecturesData.find(p => p.key === prefSelect.value) || null;
}

function makeHeader() {
  const cols = ["地点名 / 観測開始"];
  for (let i = 1; i <= 10; i++) cols.push(`${i}位`);
  tableHead.innerHTML = `
    <tr>
      ${cols.map((c, i) => `<th class="${i === 0 ? "station-col" : ""}">${c}</th>`).join("")}
    </tr>
  `;
}

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
  return `<span>${escapeHtml(first)}</span><span class="sub">${escapeHtml(second)}</span>`;
}

function formatUpdatedAt(isoText) {
  if (!isoText) return "-";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return isoText;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} 更新`;
}

async function loadManifest() {
  try {
    const res = await fetch(`./data/manifest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifestCache = await res.json();
  } catch (e) {
    console.error(e);
    manifestCache = null;
  }
}

function buildStatusText({ tableUpdatedAt, rowCount, elementLabel, prefName }) {
  const parts = [];

  if (manifestCache?.updatedAt) {
    parts.push(`更新:${formatUpdatedAt(manifestCache.updatedAt)}`);
  }

  if (typeof rowCount === "number") {
    parts.push(`地点数:${rowCount}`);
  }

  if (elementLabel) {
    parts.push(`選択中要素:${elementLabel}`);
  }

  if (prefName) {
    parts.push(`都道府県:${prefName}`);
  }

  return parts.join(" / ");
}

function renderTable(rows) {
  tableBody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div class="station-name">${escapeHtml(row.stationName)}</div>
      <div class="station-start">${renderDualLine(row.startDate || "-")}</div>
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const r = row.ranks?.[i];
      const td = document.createElement("td");

      if (r) {
        const classes = ["rank-cell"];
        if (r.highlightLive) classes.push("live-in-rank");
        if (r.highlightWithinYear) classes.push("within-year");
        td.className = classes.join(" ");
        td.innerHTML = `
          <div class="value">${escapeHtml(r.value)}</div>
          <div class="date">${renderDualLine(r.date)}</div>
        `;
      } else {
        td.className = "rank-cell";
        td.innerHTML = `<div class="value">-</div><div class="date">-</div>`;
      }

      tr.appendChild(td);
    }

    tableBody.appendChild(tr);
  }
}

function renderLiveSummary(items) {
  if (!items || items.length === 0) {
    liveSummaryEl.innerHTML = `<div class="live-summary-empty">現在、実況で10位以内に入っている項目はありません。</div>`;
    return;
  }

  const order = [
    "dailyPrecip",
    "max10mPrecip",
    "max1hPrecip",
    "monthMax1h10mPrecip",
    "monthMax3hPrecip",
    "monthMax6hPrecip",
    "monthMax12hPrecip",
    "monthMax24hPrecip",
    "monthMax48hPrecip",
    "monthMax72hPrecip",
    "monthPrecipHigh",
    "monthPrecipLow",
    "dailyMaxTempHigh",
    "dailyMaxTempLow",
    "dailyMinTempHigh",
    "dailyMinTempLow",
    "monthAvgTempHigh",
    "monthAvgTempLow",
    "dailyMinHumidity",
    "dailyMaxWind",
    "dailyMaxGust",
    "monthSunshineHigh",
    "monthSunshineLow",
    "dailySnowDepth",
    "monthSnowDepth",
    "monthMax3hSnow",
    "monthMax6hSnow",
    "monthMax12hSnow",
    "monthMax24hSnow",
    "monthMax48hSnow",
    "monthMax72hSnow",
    "monthDeepSnowHigh",
    "monthDeepSnowLow"
  ];

  const sorted = [...items].sort((a, b) => {
    const oa = order.indexOf(a.elementKey);
    const ob = order.indexOf(b.elementKey);
    if (oa !== ob) return oa - ob;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.stationName.localeCompare(b.stationName, "ja");
  });

  const overall = sorted.filter(item => item.monthLabel === "通年");
  const monthly = sorted.filter(item => item.monthLabel !== "通年");

  const renderColumn = (title, data) => `
    <div class="live-summary-column">
      <div class="live-summary-column-title">${escapeHtml(title)}</div>
      <div class="live-summary-scroll">
        ${
          data.length === 0
            ? `<div class="live-summary-empty">該当なし</div>`
            : data.map(item => `
              <div class="live-summary-item ${item.rank === 1 ? "live-summary-item-top1" : "live-summary-item-rankin"}">
                <div class="live-summary-main">
                  <span class="live-summary-rank">${escapeHtml(String(item.rank))}位</span>
                  <span>${escapeHtml(item.stationName)}</span>
                  <span>${escapeHtml(item.elementLabel)}</span>
                </div>
                <div class="live-summary-sub">
                  <span>${escapeHtml(String(item.value))}</span>
                  <span>${escapeHtml(item.date)}</span>
                  ${item.monthLabel ? `<span>${escapeHtml(item.monthLabel)}</span>` : ""}
                </div>
              </div>
            `).join("")
        }
      </div>
    </div>
  `;

  liveSummaryEl.innerHTML = `
    <div class="live-summary-grid">
      ${renderColumn("通年", overall)}
      ${renderColumn("当月", monthly)}
    </div>
  `;
}

async function loadLiveSummary(prefKey) {
  try {
    const res = await fetch(`./data/${prefKey}/live-summary.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderLiveSummary(data.items || []);
  } catch (e) {
    console.error(e);
    liveSummaryEl.innerHTML = `<div class="live-summary-empty">実況一覧の読み込みに失敗しました。</div>`;
  }
}

async function loadTable() {
  const prefMeta = getSelectedPrefMeta();
  const pref = prefSelect.value;
  const element = getSelectedElement();
  const month = monthSelect.value;
  const elementLabel = getSelectedElementLabel();

  await loadManifest();

  if (!prefMeta) {
    statusEl.textContent = "都道府県情報が見つかりません";
    tableBody.innerHTML = "";
    liveSummaryEl.innerHTML = `<div class="live-summary-empty">実況一覧を表示できません。</div>`;
    return;
  }

  await loadLiveSummary(pref);

  if (!prefMeta.stationsFile) {
    statusEl.textContent = buildStatusText({
      tableUpdatedAt: manifestCache?.updatedAt || "",
      rowCount: 0,
      elementLabel,
      prefName: prefMeta.name
    }) + " / 未対応";
    tableBody.innerHTML = "";
    return;
  }

  statusEl.textContent = "読み込み中...";

  try {
    const res = await fetch(`./data/${pref}/${element}-${month}.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    makeHeader();
    renderTable(data.rows || []);

    statusEl.textContent = buildStatusText({
      tableUpdatedAt: data.updatedAt || manifestCache?.updatedAt || "",
      rowCount: data.rows?.length ?? 0,
      elementLabel,
      prefName: prefMeta.name
    });
  } catch (e) {
    console.error(e);
    statusEl.textContent = buildStatusText({
      tableUpdatedAt: manifestCache?.updatedAt || "",
      rowCount: 0,
      elementLabel,
      prefName: prefMeta.name
    }) + " / JSONの読み込みに失敗しました";
    tableBody.innerHTML = "";
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadTable, 10 * 60 * 1000);
}

async function init() {
  makeHeader();
  await initPrefectures();

  regionSelect.addEventListener("change", async () => {
    populatePrefectures();
    await loadTable();
  });

  prefSelect.addEventListener("change", loadTable);
  monthSelect.addEventListener("change", loadTable);
  document.querySelectorAll('input[name="element"]').forEach(el => {
    el.addEventListener("change", loadTable);
  });

  await loadTable();
  startAutoRefresh();
}

init().catch(err => {
  console.error(err);
  statusEl.textContent = "初期化に失敗しました";
});
