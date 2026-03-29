const prefSelect = document.getElementById("prefSelect");
const elementSelect = document.getElementById("elementSelect");
const monthSelect = document.getElementById("monthSelect");
const loadBtn = document.getElementById("loadBtn");
const statusEl = document.getElementById("status");
const tableHead = document.getElementById("tableHead");
const tableBody = document.getElementById("tableBody");

let timer = null;

function makeHeader() {
  const cols = ['地点名 / 観測開始'];
  for (let i = 1; i <= 10; i++) cols.push(`${i}位`);

  tableHead.innerHTML = `
    <tr>
      ${cols.map((c, i) => `<th class="${i === 0 ? "station-col" : ""}">${c}</th>`).join("")}
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
      <div class="station-name">${row.stationName}</div>
      <div class="station-start">観測開始: ${row.startDate || "-"}</div>
    `;
    tr.appendChild(stationTd);

    for (let i = 0; i < 10; i++) {
      const r = row.ranks[i];
      const td = document.createElement("td");

      if (r) {
        const classes = ["rank-cell"];
        if (r.highlightLive) classes.push("live-in-rank");
        if (r.highlightWithinYear) classes.push("within-year");
        td.className = classes.join(" ");

        td.innerHTML = `
          <div class="value">${r.value ?? "-"}</div>
          <div class="date">${r.date ?? "-"}</div>
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
  const element = elementSelect.value;
  const month = monthSelect.value;

  statusEl.textContent = "読み込み中...";

  try {
    const res = await fetch(`/api/extremes?pref=${encodeURIComponent(pref)}&element=${encodeURIComponent(element)}&month=${encodeURIComponent(month)}`);
    const data = await res.json();

    makeHeader();
    renderTable(data.rows || []);
    statusEl.textContent = `更新: ${data.updatedAt || "-"} / 地点数: ${data.rows?.length ?? 0}`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "読み込みに失敗しました";
  }
}

loadBtn.addEventListener("click", loadTable);

loadTable();

timer = setInterval(loadTable, 60 * 1000);
