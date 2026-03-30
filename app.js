const prefSelect = document.getElementById("prefSelect");
const monthSelect = document.getElementById("monthSelect");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");

function getSelectedElement() {
  const checked = document.querySelector('input[name="element"]:checked');
  return checked ? checked.value : "dailyMaxTemp";
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

function renderTable(rows) {
  tableBody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");

    const stationTd = document.createElement("td");
    stationTd.className = "station-col";
    stationTd.innerHTML = `
      <div class="station-name">${escapeHtml(row.stationName)}</div>
      <div class="station-start">観測開始: ${escapeHtml(row.startDate || "-")}</div>
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
          <div class="date">${escapeHtml(r.date)}</div>
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
    statusEl.textContent = `更新: ${data.updatedAt || "-"} / 地点数: ${data.rows?.length ?? 0}`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = "JSONの読み込みに失敗しました";
    tableBody.innerHTML = "";
  }
}

makeHeader();
loadBtn.addEventListener("click", loadTable);

document.querySelectorAll('input[name="element"]').forEach(el => {
  el.addEventListener("change", loadTable);
});

loadTable();
setInterval(loadTable, 60 * 1000);
