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

export async function loadStations(prefKey, region) {
  const cacheKey = `${region}|${prefKey}`;
  if (state.stationConfigCache.has(cacheKey)) {
    return state.stationConfigCache.get(cacheKey);
  }

  const path = `./config/stations/${region}/${prefKey}.json`;
  state.debug.stationsPath = path;

  try {
    const raw = await fetchJson(path);
    const stations = normalizeStations(raw);
    const indexed = buildStationIndex(stations);
    const payload = { stations, index: indexed, missing: false };
    state.stationConfigCache.set(cacheKey, payload);
    return payload;
  } catch (error) {
    const payload = {
      stations: [],
      index: buildStationIndex([]),
      missing: true,
      error: error.message || String(error),
    };
    state.stationConfigCache.set(cacheKey, payload);
    return payload;
  }
}

export async function loadTable(prefKey, region, elementKey, month) {
  const cacheKey = `${region}|${prefKey}|${elementKey}|${month}`;
  if (state.tableCache.has(cacheKey)) {
    return state.tableCache.get(cacheKey);
  }

  const path = `./data/${region}/${prefKey}/${elementKey}-${month}.json`;
  state.debug.tablePath = path;

  try {
    const data = await fetchJson(path);
    const normalized = {
      ...data,
      rows: Array.isArray(data?.rows) ? data.rows : [],
      missing: false,
    };
    state.tableCache.set(cacheKey, normalized);
    return normalized;
  } catch (error) {
    const fallback = {
      rows: [],
      missing: true,
      error: error.message || String(error),
    };
    state.tableCache.set(cacheKey, fallback);
    return fallback;
  }
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
      if (key) byNormalizedName.set(key, station);
    }
  }

  return { byNormalizedName, byCode };
}

export function findStationByRowName(rowStationName, stationIndex) {
  const key = normalizeStationName(rowStationName);
  return stationIndex.byNormalizedName.get(key) || null;
}

export function getElementListByMonth(month, elementsConfig) {
  if (!elementsConfig) return [];
  return month === "all"
    ? (elementsConfig.annualElements || [])
    : (elementsConfig.monthlyElements || []);
}

export function getDefaultElementKey(month, elementsConfig) {
  if (!elementsConfig) return "";
  return month === "all"
    ? (elementsConfig.annualDefaultElement || "")
    : (elementsConfig.monthlyDefaultElement || "");
}
