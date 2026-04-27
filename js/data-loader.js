import { state } from "./state.js";
import { fetchJson, normalizeStationName } from "./utils.js";

export async function loadPrefectures() {
  const data = await fetchJson("./config/prefectures.json");
  state.prefectures = Array.isArray(data) ? data : (data.prefectures || []);
  return state.prefectures;
}

export async function loadElements() {
  const data = await fetchJson("./config/elements.json");
  state.elements = data;
  return data;
}

export async function loadManifest() {
  try {
    const data = await fetchJson("./data/manifest.json");
    state.manifest = data;
    return data;
  } catch {
    state.manifest = null;
    return null;
  }
}

/**
 * 都道府県の stations 設定を読む。
 * 新パス専用:
 *   ./config/stations/kinki/nara.json
 */
export async function loadStations(prefKey, region = "") {
  const cacheKey = `${region}|${prefKey}`;
  if (state.stationConfigCache.has(cacheKey)) {
    return state.stationConfigCache.get(cacheKey);
  }

  const regionDir = normalizeRegionDir(region);
  const path = `./config/stations/${regionDir}/${prefKey}.json`;
  state.debug.stationsPath = path;

  try {
    const raw = await fetchJson(path);
    const stations = normalizeStations(raw);
    const indexed = buildStationIndex(stations);

    const payload = {
      stations,
      index: indexed,
      missing: false,
      path,
    };

    state.stationConfigCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    const payload = {
      stations: [],
      index: buildStationIndex([]),
      missing: true,
      error: error.message || String(error),
      path,
    };

    state.stationConfigCache.set(cacheKey, payload);
    return payload;
  }
}

/**
 * 極値テーブルJSONを読む。
 * 新パス専用:
 *   ./data/kinki/nara/dailyPrecip-all.json
 */
export async function loadTable(prefKey, region = "", elementKey, month) {
  const cacheKey = `${region}|${prefKey}|${elementKey}|${month}`;
  if (state.tableCache.has(cacheKey)) {
    return state.tableCache.get(cacheKey);
  }

  const regionDir = normalizeRegionDir(region);
  const fileName = `${elementKey}-${month}.json`;
  const path = `./data/${regionDir}/${prefKey}/${fileName}`;
  state.debug.tablePath = path;

  try {
    const data = await fetchJson(path);
    const normalized = {
      ...data,
      rows: Array.isArray(data?.rows) ? data.rows : [],
      missing: false,
      path,
    };

    state.tableCache.set(cacheKey, normalized);
    return normalized;
  } catch (error) {
    const fallback = {
      rows: [],
      missing: true,
      error: error.message || String(error),
      path,
    };

    state.tableCache.set(cacheKey, fallback);
    return fallback;
  }
}

function normalizeRegionDir(region) {
  if (!region) return "";

  const map = {
    "北海道": "hokkaido",
    "東北": "tohoku",
    "関東甲信": "kanto_koshin",
    "北陸": "hokuriku",
    "東海": "tokai",
    "近畿": "kinki",
    "中国": "chugoku",
    "四国": "shikoku",
    "九州北部": "kyushu_north",
    "九州南部・奄美": "kyushu_south",
    "沖縄": "okinawa",
  };

  return map[region] || region;
}

function normalizeStations(raw) {
  const list = [];

  const pushItem = (item) => {
    if (!item || typeof item !== "object") return;

    const code = String(
      item.blockNo ??
      item.amedasCode ??
      item.stationCode ??
      item.code ??
      ""
    ).trim();

    const name =
      item.name ??
      item.stationName ??
      item.kjName ??
      item.label ??
      "";

    if (!code || !name) return;

    list.push({
      code,
      name: String(name).trim(),
      startDate: item.startDate ?? item.observedStart ?? item.beginDate ?? "",
      raw: item,
    });
  };

  if (Array.isArray(raw?.stations)) {
    raw.stations.forEach(pushItem);
  } else if (Array.isArray(raw)) {
    raw.forEach(pushItem);
  } else if (raw && typeof raw === "object") {
    Object.values(raw).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach(pushItem);
      } else if (value && typeof value === "object") {
        pushItem(value);
      }
    });
  }

  return list;
}

function buildStationIndex(stations) {
  const byNormalizedName = new Map();
  const byCode = new Map();

  for (const station of stations) {
    byCode.set(station.code, station);
    byNormalizedName.set(normalizeStationName(station.name), station);

    const aliases = station.raw?.aliases || station.raw?.alias || [];
    const aliasList = Array.isArray(aliases) ? aliases : [aliases];

    for (const alias of aliasList) {
      const key = normalizeStationName(alias);
      if (key) {
        byNormalizedName.set(key, station);
      }
    }
  }

  return { byNormalizedName, byCode };
}

export function findStationByRowName(rowStationName, stationIndex) {
  const key = normalizeStationName(rowStationName);
  return stationIndex?.byNormalizedName?.get(key) || null;
}

export function getElementListByMonth(month, elementsConfig) {
  if (!elementsConfig) return [];

  const list = month === "all"
    ? (elementsConfig.annualElements || [])
    : (elementsConfig.monthlyElements || []);

  return list.filter(item => !item.hidden);
}

export function getDefaultElementKey(month, elementsConfig) {
  if (!elementsConfig) return "";
  return month === "all"
    ? (elementsConfig.annualDefaultElement || "")
    : (elementsConfig.monthlyDefaultElement || "");
}
