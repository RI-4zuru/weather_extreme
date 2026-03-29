import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const stations = JSON.parse(
  fs.readFileSync(path.join(__dirname, "stations.json"), "utf-8")
);

app.use(express.static(path.join(__dirname, "..", "public")));

const ELEMENT_DEFS = {
  dailyMaxTemp: {
    labelIncludes: ["日最高気温", "最高気温"],
    direction: "desc",
    liveType: "tempMax"
  },
  dailyMinTemp: {
    labelIncludes: ["日最低気温", "最低気温"],
    direction: "asc",
    liveType: "tempMin"
  }
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateYmd(dateObj) {
  const y = dateObj.getFullYear();
  const m = pad2(dateObj.getMonth() + 1);
  const d = pad2(dateObj.getDate());
  return `${y}/${m}/${d}`;
}

function withinOneYear(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr.replace(/\//g, "-"));
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  return diff >= 0 && diff <= 365 * 24 * 60 * 60 * 1000;
}

function sortRecords(records, direction) {
  return [...records].sort((a, b) => {
    const av = Number(a.value);
    const bv = Number(b.value);

    if (av !== bv) {
      return direction === "desc" ? bv - av : av - bv;
    }

    const ad = new Date(String(a.date).replace(/\//g, "-"));
    const bd = new Date(String(b.date).replace(/\//g, "-"));
    return bd - ad;
  });
}

function extractStartDate(text) {
  const m = text.match(/(\d{4}\/\d{1,2})/);
  return m ? m[1] : "";
}

function normalizeMonth(month) {
  return month === "all" ? "" : month;
}

function buildRankUrl(station, month) {
  const mm = normalizeMonth(month);
  return `https://www.data.jma.go.jp/stats/etrn/view/rank_s.php?prec_no=${station.precNo}&block_no=${station.blockNo}&year=&month=${mm}&day=&view=${station.rankView}`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} ${res.status}`);
  }
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${url} ${res.status}`);
  }
  return await res.json();
}

function parseDateFromCell(cellText) {
  const cleaned = cellText.replace(/\s+/g, " ").trim();

  const dateMatch = cleaned.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = pad2(dateMatch[2]);
    const d = pad2(dateMatch[3]);
    return `${y}/${m}/${d}`;
  }

  const fallback = cleaned.match(/(\d{1,2})\/(\d{1,2})/);
  if (fallback) {
    return `----/${pad2(fallback[1])}/${pad2(fallback[2])}`;
  }

  return "";
}

function parseValueFromCell(cellText) {
  const m = cellText.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function parseRankPage(html, elementKey) {
  const def = ELEMENT_DEFS[elementKey];
  const $ = cheerio.load(html);

  let matchedRow = null;
  let startDate = "";

  $("tr").each((_, tr) => {
    const rowText = $(tr).text().replace(/\s+/g, " ").trim();
    const ok = def.labelIncludes.some(label => rowText.includes(label));
    if (!ok || matchedRow) return;

    const tds = $(tr).find("td");
    if (tds.length < 5) return;

    matchedRow = tr;
  });

  if (!matchedRow) {
    return null;
  }

  const tds = $(matchedRow).find("td");
  const rowText = $(matchedRow).text().replace(/\s+/g, " ").trim();
  startDate = extractStartDate(rowText);

  const records = [];

  tds.each((i, td) => {
    const text = $(td).text().replace(/\s+/g, " ").trim();

    const value = parseValueFromCell(text);
    const date = parseDateFromCell(text);

    if (value !== null && date) {
      records.push({
        value,
        date
      });
    }
  });

  const sorted = sortRecords(records, def.direction).slice(0, 10);

  return {
    startDate,
    records: sorted.map((r, i) => ({
      rank: i + 1,
      value: r.value,
      date: r.date
    }))
  };
}

async function fetchLatestAmedasSnapshotTime() {
  const text = await fetchText("https://www.jma.go.jp/bosai/amedas/data/latest_time.txt");
  return text.trim();
}

function toMapTimeKey(isoText) {
  const d = new Date(isoText);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${y}${m}${day}${hh}${mm}${ss}`;
}

async function fetchLatestMapData() {
  const latest = await fetchLatestAmedasSnapshotTime();
  const key = toMapTimeKey(latest);
  const url = `https://www.jma.go.jp/bosai/amedas/data/map/${key}.json`;
  const json = await fetchJson(url);
  return { latest, json };
}

function pickLiveValue(mapJson, amedasCode, liveType) {
  const item = mapJson[String(amedasCode)];
  if (!item) return null;

  if (liveType === "tempMax" || liveType === "tempMin") {
    if (!item.temp || item.temp[0] == null) return null;
    return Number(item.temp[0]);
  }

  return null;
}

function checkLiveRankIn(records, liveValue, direction, todayStr) {
  if (liveValue == null) return records.map(r => ({ ...r, highlightLive: false }));

  const merged = [...records, { value: liveValue, date: todayStr, isLive: true }];
  const sorted = sortRecords(merged, direction).slice(0, 10);

  return sorted.map((r, i) => ({
    rank: i + 1,
    value: r.value,
    date: r.date,
    highlightLive: !!r.isLive,
    highlightWithinYear: withinOneYear(r.date)
  }));
}

app.get("/api/extremes", async (req, res) => {
  try {
    const pref = req.query.pref || "奈良県";
    const element = req.query.element || "dailyMaxTemp";
    const month = req.query.month || "all";

    const def = ELEMENT_DEFS[element];
    if (!def) {
      return res.status(400).json({ error: "unknown element" });
    }

    const targetStations = stations.filter(s => s.prefName === pref);

    const { latest, json: mapJson } = await fetchLatestMapData();
    const todayStr = formatDateYmd(new Date());

    const rows = [];

    for (const station of targetStations) {
      try {
        const url = buildRankUrl(station, month);
        const html = await fetchText(url);
        const parsed = parseRankPage(html, element);

        if (!parsed || !parsed.records.length) {
          continue;
        }

        const liveValue = pickLiveValue(mapJson, station.amedasCode, def.liveType);
        const ranked = checkLiveRankIn(parsed.records, liveValue, def.direction, todayStr);

        rows.push({
          stationName: station.stationName,
          startDate: parsed.startDate,
          ranks: ranked
        });
      } catch (e) {
        console.error(`station failed: ${station.stationName}`, e);
      }
    }

    res.json({
      updatedAt: latest,
      prefecture: pref,
      element,
      month,
      rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});
