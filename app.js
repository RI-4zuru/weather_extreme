const regionSelect = document.getElementById("regionSelect");
const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const liveSummaryEl = document.getElementById("liveSummary");

let refreshTimer = null;
let prefecturesData = [];

const ELEMENT_LABELS = {
  dailyPrecip: "日降水量",
  max10mPrecip: "日最大10分間降水量",
  max1hPrecip: "日最大1時間降水量",
  monthMax24hPrecip: "月最大24時間降水量",
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
  const key = getSelectedElement();
  return ELEMENT_LABELS[key] || key;
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
  const target = prefecturesData.filter(p => p.region === region);

  prefSelect.innerHTML = target
    .map(pref => `<option value="${pref.key}">${pref.name}</option>`)
    .join("");
}

function getSelectedPrefMeta() {
  const key = prefSelect.value;
  return prefecturesData.find(p => p.key === key) || null;
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
  return `
    <span>${escapeHtml(first)}</span>
    <span class="sub">${escapeHtml(second)}</span>
  `;
}

function formatUpdatedAt(isoText) {
  if (!isoText) return "-";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return isoText;

  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");

  return `${y}年${m}月${day}日 ${hh}:${mm} 更新`;
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
        td.innerHTML = `
          <div class="value">-</div>
          <div class="date">-</div>
        `;
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

  liveSummaryEl.innerHTML = `
    <div class="live-summary-list">
      ${items.map(item => `
        <div class="live-summary-item">
          <span class="live-summary-rank">${escapeHtml(item.rank)}位</span>
          /
          <span>${escapeHtml(item.stationName)}</span>
          /
          <span>${escapeHtml(item.elementLabel)}</span>
          /
          <span>${escapeHtml(String(item.value))}</span>
          /
          <span>${escapeHtml(item.date)}</span>
          ${item.monthLabel ? `/ <span>${escapeHtml(item.monthLabel)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

async function loadLiveSummary(prefKey) {
  const file = `./data/${prefKey}-live-summary.json?t=${Date.now()}`;

  try {
    const res = await fetch(file, { cache: "no-store" });
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

  if (!prefMeta) {
    statusEl.textContent = "都道府県情報が見つかりません";
    tableBody.innerHTML = "";
    liveSummaryEl.innerHTML = `<div class="live-summary-empty">実況一覧を表示できません。</div>`;
    return;
  }

  await loadLiveSummary(pref);

  if (!prefMeta.stationsFile) {
    statusEl.textContent = `選択中要素: ${elementLabel} / ${prefMeta.name} はまだデータ未対応です`;
    tableBody.innerHTML = "";
    return;
  }

  const file = `./data/${pref}-${element}-${month}.json?t=${Date.now()}`;
  statusEl.textContent = "読み込み中...";

  try {
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    makeHeader();
    renderTable(data.rows || []);
    statusEl.textContent = `${formatUpdatedAt(data.updatedAt)} / 地点数: ${data.rows?.length ?? 0} / 選択中要素: ${elementLabel}`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = `選択中要素: ${elementLabel} / JSONの読み込みに失敗しました`;
    tableBody.innerHTML = "";
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadTable, 10 * 60 * 1000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
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
