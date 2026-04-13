import { PATHS } from "./constants.js";
import { state } from "./state.js";
import { fetchJson, normalizeStationName } from "./utils.js";

export async function loadPrefectures() {
  const data = await fetchJson(PATHS.prefectures);
  state.prefectures = data.prefectures || [];
  return state.prefectures;
}

export async function loadElements() {
  const data = await fetchJson(PATHS.elements);
  state.elements = data;
  return data;
}

export async function loadManifest() {
  try {
    const data = await fetchJson(PATHS.manifest);
    state.manifest = data;
    return data;
  } catch (error) {
    state.manifest = null;
    return null;
  }
}

export async function loadStations(prefKey) {
  if (state.stationConfigCache.has(prefKey)) {
    return state.stationConfigCache.get(prefKey);
  }

  const path = PATHS.stations(prefKey);
  state.debug.stationsPath = path;
  const raw = await fetchJson(path);
  const stations = normalizeStations(raw);
  const indexed = buildStationIndex(stations);
  const payload = { stations, index: indexed };
  state.stationConfigCache.set(prefKey, payload);
  return payload;
}

export async function loadTable(prefKey, elementKey, month) {
  const cacheKey = `${prefKey}|${elementKey}|${month}`;
  if (state.tableCache.has(cacheKey)) {
    return state.tableCache.get(cacheKey);
  }

  const path = PATHS.table(prefKey, elementKey, month);
  state.debug.tablePath = path;
  const data = await fetchJson(path);
  state.tableCache.set(cacheKey, data);
  return data;
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
