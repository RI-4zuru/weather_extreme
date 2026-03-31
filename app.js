const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");
const autoRefreshToggle = document.getElementById("autoRefreshToggle");

const AUTO_REFRESH_KEY = "weatherExtremeAutoRefresh";
let refreshTimer = null;
let autoRefreshEnabled = localStorage.getItem(AUTO_REFRESH_KEY) !== "off";

function getSelectedElement() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : "dailyPrecip";
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

async function loadTable() {
  const pref = prefSelect.value;
  const element = getSelectedElement();
  const month = monthSelect.value;
  const file = `./data/${pref}-${element}-${month}.json?t=${Date.now()}`;

  statusEl.textContent = "読み込み中...";

  try {
    const res = await fetch(file, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    makeHeader();
    renderTable(data.rows || []);
    statusEl.textContent = `${formatUpdatedAt(data.updatedAt)} / 地点数: ${data.rows?.length ?? 0}`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = "JSONの読み込みに失敗しました";
    tableBody.innerHTML = "";
  }
}

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadTable, 60 * 1000);
}

function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function updateAutoRefreshUI() {
  autoRefreshToggle.textContent = autoRefreshEnabled ? "ON" : "OFF";
  autoRefreshToggle.classList.toggle("is-off", !autoRefreshEnabled);
  autoRefreshToggle.setAttribute("aria-pressed", String(autoRefreshEnabled));
}

function applyAutoRefreshState() {
  updateAutoRefreshUI();
  if (autoRefreshEnabled) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

makeHeader();

prefSelect.addEventListener("change", loadTable);
monthSelect.addEventListener("change", loadTable);
document.querySelectorAll('input[name="element"]').forEach(el => {
  el.addEventListener("change", loadTable);
});

autoRefreshToggle.addEventListener("click", () => {
  autoRefreshEnabled = !autoRefreshEnabled;
  localStorage.setItem(AUTO_REFRESH_KEY, autoRefreshEnabled ? "on" : "off");
  applyAutoRefreshState();
});

loadTable();
applyAutoRefreshState();
