import { state } from "./state.js";
import { fetchJsonWithMeta } from "./utils.js";

export async function loadPrefectures() {
  const data = await fetchJsonWithMeta("./config/prefectures.json");
  state.prefecturesData = data.prefectures || [];
  return state.prefecturesData;
}

export async function loadManifest() {
  const debug = state.debugState.manifest;

  debug.ok = false;
  debug.error = "";
  debug.observationTime = "";
  debug.generatedAt = "";

  try {
    const data = await fetchJsonWithMeta("./data/manifest.json");
    state.manifestCache = data;

    debug.ok = true;
    debug.observationTime =
      data.observationTime || data.baseTime || data.updatedAt || "";
    debug.generatedAt = data.generatedAt || "";

    return data;
  } catch (error) {
    state.manifestCache = null;
    debug.error = error.message || String(error);
    throw error;
  }
}

export async function loadLiveSummaryData(prefKey) {
  const path = `./data/${prefKey}/live-summary.json`;
  const debug = state.debugState.liveSummary;

  debug.path = path;
  debug.ok = false;
  debug.itemCount = 0;
  debug.status = "";
  debug.message = "";
  debug.observationTime = "";
  debug.generatedAt = "";
  debug.error = "";

  try {
    const data = await fetchJsonWithMeta(path);

    const items = data.items || [];
    debug.ok = true;
    debug.itemCount = items.length;
    debug.status = data.status || "ok";
    debug.message = data.message || "";
    debug.observationTime =
      data.observationTime || data.baseTime || data.updatedAt || "";
    debug.generatedAt = data.generatedAt || "";

    return data;
  } catch (error) {
    debug.error = error.message || String(error);
    throw error;
  }
}

export async function loadTableData(prefKey, elementKey, month) {
  const path = `./data/${prefKey}/${elementKey}-${month}.json`;
  const debug = state.debugState.table;

  debug.path = path;
  debug.ok = false;
  debug.rowCount = 0;
  debug.status = "";
  debug.message = "";
  debug.observationTime = "";
  debug.generatedAt = "";
  debug.error = "";

  try {
    const data = await fetchJsonWithMeta(path);

    const rows = data.rows || [];
    debug.ok = true;
    debug.rowCount = rows.length;
    debug.status = data.status || "ok";
    debug.message = data.message || "";
    debug.observationTime =
      data.observationTime || data.baseTime || data.updatedAt || "";
    debug.generatedAt = data.generatedAt || "";

    return data;
  } catch (error) {
    debug.error = error.message || String(error);
    throw error;
  }
}
