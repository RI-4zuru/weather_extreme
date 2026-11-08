import {
  JMA_ENDPOINTS,
  LIVE_SUPPORTED_ANNUAL_KEYS,
  LIVE_SUPPORTED_MONTHLY_KEYS,
} from "./constants.js";
import { state } from "./state.js";
import { choosePublishedExtremum, loadOfficialExtrema, jstDay } from "./official-extrema.js";
import {
  asNumber,
  fetchJson,
  fetchText,
  getTodayPointSlots,
  max,
  min,
  rollingMax,
  sum,
  toJmaMapTimestamp,
} from "./utils.js";

// Collapse simultaneous requests for the same JMA resource, and bound concurrent
// point downloads. The bulletin checks many elements with the same source data.
let latestTimePending = null;
let latestMapPending = null;
const chunkPending = new Map();
const dayPending = new Map();
let activePointRequests = 0;
const pointQueue = [];
async function withPointSlot(task) {
  if (activePointRequests >= 8) await new Promise(resolve => pointQueue.push(resolve));
  activePointRequests++;
  try { return await task(); }
  finally { activePointRequests--; pointQueue.shift()?.(); }
}

export function isLiveSupported(elementKey, month) {
  if (LIVE_SUPPORTED_ANNUAL_KEYS.has(elementKey)) {
    return true;
  }

  if (month !== "all" && LIVE_SUPPORTED_MONTHLY_KEYS.has(elementKey)) {
    return true;
  }

  return false;
}

export async function fetchLatestObservationTime() {
  const now = Date.now();
  if (
    state.latestTimeCache.iso &&
    now - state.latestTimeCache.fetchedAt < 60 * 1000
  ) {
    return state.latestTimeCache.iso;
  }

  if (latestTimePending) return latestTimePending;
  latestTimePending = (async () => {
    const text = await fetchText(JMA_ENDPOINTS.latestTime);
    const iso = text.trim();
    state.latestTimeCache = { iso, fetchedAt: Date.now() };
    return iso;
  })();
  try { return await latestTimePending; }
  finally { latestTimePending = null; }
}

export async function fetchLatestMap(latestIso) {
  if (
    state.latestMapCache.iso === latestIso &&
    state.latestMapCache.data
  ) {
    return state.latestMapCache.data;
  }

  if (latestMapPending?.iso === latestIso) return latestMapPending.promise;
  const promise = (async () => {
    const timestamp = toJmaMapTimestamp(latestIso);
    const data = await fetchJson(JMA_ENDPOINTS.map(timestamp));
    state.latestMapCache = { iso:latestIso, data, fetchedAt:Date.now() };
    return data;
  })();
  latestMapPending = { iso:latestIso, promise };
  try { return await promise; }
  finally { if (latestMapPending?.promise === promise) latestMapPending = null; }
}

async function fetchPointChunk(stationCode, slot, latestIso) {
  // Completed 3-hour slots are immutable; the current 3-hour chunk is not.
  const cacheKey = `${stationCode}|${slot}|${latestIso ? latestIso : "closed"}`;
  if (state.pointChunkCache.has(cacheKey)) {
    return state.pointChunkCache.get(cacheKey);
  }

  if (chunkPending.has(cacheKey)) return chunkPending.get(cacheKey);
  const pending = withPointSlot(async () => {
    state.debug.pointFetchCount += 1;
    const data = await fetchJson(JMA_ENDPOINTS.point(stationCode, slot));
    if (latestIso) {
      for (const key of state.pointChunkCache.keys()) {
        if (key.startsWith(`${stationCode}|${slot}|`) && key !== cacheKey) state.pointChunkCache.delete(key);
      }
    }
    state.pointChunkCache.set(cacheKey, data);
    return data;
  });
  chunkPending.set(cacheKey, pending);
  try { return await pending; }
  finally { chunkPending.delete(cacheKey); }
}

async function fetchTodayPointRecords(stationCode, latestIso) {
  const cacheKey = `${stationCode}|today|${latestIso}`;
  if (state.pointDailyCache.has(cacheKey)) {
    return state.pointDailyCache.get(cacheKey);
  }

  if (dayPending.has(cacheKey)) return dayPending.get(cacheKey);
  const pending = (async () => {
    const slots = getTodayPointSlots(latestIso);
    const latestSlot = slots.at(-1);
    const chunks = await Promise.all(slots.map(slot => fetchPointChunk(stationCode, slot, slot === latestSlot ? latestIso : null).catch(() => null)));
    const rows = [];
    if (!chunks.some(chunk => chunk && typeof chunk === 'object')) {
      throw new Error(`地点 ${stationCode} の観測データを取得できませんでした`);
    }
    for (const chunk of chunks) {
      if (!chunk || typeof chunk !== "object") continue;
      for (const [timeKey, item] of Object.entries(chunk)) rows.push({timeKey,data:item||{}});
    }
    rows.sort((a,b) => String(a.timeKey).localeCompare(String(b.timeKey),'ja'));
    // Retain one version per station to avoid unbounded memory on auto-refresh.
    for (const key of state.pointDailyCache.keys()) {
      if (key.startsWith(`${stationCode}|today|`) && key !== cacheKey) state.pointDailyCache.delete(key);
    }
    state.pointDailyCache.set(cacheKey,rows);
    return rows;
  })();
  dayPending.set(cacheKey,pending);
  try {return await pending;}
  finally {dayPending.delete(cacheKey); }
}

function extractSeries(records, fieldNames) {
  return records.map((record) => {
    for (const fieldName of fieldNames) {
      const value = asNumber(record.data?.[fieldName]);
      if (value !== null) return value;
    }
    return null;
  });
}

function calcDailyMetrics(records) {
  const precip10m = extractSeries(records, ["precipitation10m"]);
  const temp = extractSeries(records, ["temp"]);
  const humidity = extractSeries(records, ["humidity"]);
  const wind = extractSeries(records, ["wind"]);
  const gust = extractSeries(records, ["gust", "maxWind"]);

  // A missing precipitation sample must not be silently counted as 0.
  // Missing daily samples can undercount a record, so suppress that fallback.
  const completePrecip = precip10m.length > 0 && precip10m.every(Number.isFinite);
  const oneHourCandidates = [];
  for (let i = 5; i < precip10m.length; i++) {
    const window = precip10m.slice(i - 5, i + 1);
    if (window.every(Number.isFinite)) oneHourCandidates.push(sum(window));
  }
  return {
    dailyPrecip: completePrecip ? sum(precip10m) : null,
    max10mPrecip: max(precip10m),
    max1hPrecip: max(oneHourCandidates),
    dailyMaxTemp: max(temp),
    dailyMinTemp: min(temp),
    dailyMinHumidity: min(humidity),
    dailyMaxWind: max(wind),
    dailyMaxGust: max(gust),
  };
}

function calcMonthlyLiteMetricsFromMap(mapItem) {
  const currentSnowDepth = asNumber(mapItem?.snow);
  return {
    monthMax3hPrecip: asNumber(mapItem?.precipitation3h),
    monthMax24hPrecip: asNumber(mapItem?.precipitation24h),
    monthMax48hPrecip: asNumber(mapItem?.precipitation48h),
    monthMax72hPrecip: asNumber(mapItem?.precipitation72h),
    monthDeepSnowHigh: currentSnowDepth,
    monthDeepSnowLow: currentSnowDepth,
  };
}

async function calcMonthlyPointExtendedMetrics(stationCode, latestIso) {
  const records = await fetchTodayPointRecords(stationCode, latestIso);
  const precip10m = extractSeries(records, ["precipitation10m"]).map((v) =>
    Number.isFinite(v) ? v : 0
  );

  return {
    monthMax6hPrecip: rollingMax(precip10m, 36),
    monthMax12hPrecip: rollingMax(precip10m, 72),
  };
}

export async function buildLiveValuesForStations({
  stationCodes,
  elementKey,
  month,
}) {
  const latestIso = await fetchLatestObservationTime();
  const result = {};

  if (!isLiveSupported(elementKey, month)) {
    return {
      latestIso,
      valuesByCode: result,
      support: "unsupported",
      message: "この要素の実況判定はブラウザ単独版では未対応です。",
    };
  }

  // JMA daily maximum 3-72-hour precipitation is NOT the instantaneous
  // 3/6/..-hour total in the AMeDAS map. Do not substitute the current map
  // snapshot or a truncated today's 10-minute series for a daily maximum.
  // Values are available independently of the visible table/period.
  const officialOnly = new Set([
    'max24hPrecip', 'monthMax3hPrecip', 'monthMax6hPrecip',
    'monthMax12hPrecip', 'monthMax24hPrecip',
    'monthMax48hPrecip', 'monthMax72hPrecip',
  ]);
  if (officialOnly.has(elementKey)) {
    const officialSnapshot = await loadOfficialExtrema();
    for (const stationCode of stationCodes) {
      result[stationCode] = choosePublishedExtremum({
        snapshot:officialSnapshot, stationCode, elementKey, latestIso,
        fallback:{value:null,observedAt:latestIso,sourceResolution:'',sourceLabel:''},
      });
    }
    return {
      latestIso, valuesByCode:result, support: 'supported',
      message: officialSnapshot?.observedDate === jstDay(latestIso)
        ? '気象庁公表の当日日最大降水量（10分間隔集計）を使用。'
        : '公表降水量の取得待ち（直近積算値で代用しません）。',
    };
  }

  const isAnnual = LIVE_SUPPORTED_ANNUAL_KEYS.has(elementKey);
  const isMonthly = LIVE_SUPPORTED_MONTHLY_KEYS.has(elementKey);

  // ------------------------
  // ■ 通年系（気温・風・湿度・短時間雨）
  // → 月選択でもここに入る
  // ------------------------
  if (isAnnual) {
    const officialSnapshot = await loadOfficialExtrema();
    await Promise.all(
      stationCodes.map(async (stationCode) => {
        try {
          const records = await fetchTodayPointRecords(stationCode, latestIso);
          const metrics = calcDailyMetrics(records);
          const value = pickAnnualMetric(metrics, elementKey);
          const reference = {
            value,
            observedAt: timeOfPointExtreme(records, elementKey, latestIso),
            sourceResolution: 'ten-minute',
            sourceLabel: '10分値から算出',
          };
          result[stationCode] = choosePublishedExtremum({
            snapshot: officialSnapshot, stationCode, elementKey, latestIso,
            fallback: reference,
          });
        } catch (error) {
          const published = choosePublishedExtremum({
            snapshot: officialSnapshot, stationCode, elementKey, latestIso,
            fallback: {value:null, observedAt:latestIso, sourceResolution:'ten-minute'},
          });
          result[stationCode] = {
            ...published,
            error: error.message || String(error),
          };
        }
      })
    );

    return {
      latestIso,
      valuesByCode: result,
      support: "supported",
      message: officialSnapshot?.observedDate ? "気象庁公表の日極値を優先、未更新分は10分値で参考判定。" : "10分値による参考判定（公表極値の未取得時）。",
    };
  }

  // ------------------------
  // ■ 月系（長時間雨・雪）
  // ------------------------
  if (isMonthly && !isAnnual && month !== "all") {
    const mapData = await fetchLatestMap(latestIso);
    await Promise.all(
      stationCodes.map(async (stationCode) => {
        try {
          const mapItem = mapData?.[stationCode] || {};
          const monthlyLite = calcMonthlyLiteMetricsFromMap(mapItem);

          let value = monthlyLite[elementKey] ?? null;

          // 6h・12hは point データから計算
          if (
            (elementKey === "monthMax6hPrecip" ||
              elementKey === "monthMax12hPrecip") &&
            value === null
          ) {
            const ext = await calcMonthlyPointExtendedMetrics(
              stationCode,
              latestIso
            );
            value = ext[elementKey] ?? null;
          }

          result[stationCode] = {
            value,
            observedAt: latestIso,
            sourceResolution: 'ten-minute',
            sourceLabel: '10分値・直近積算',
          };
        } catch (error) {
          result[stationCode] = {
            value: null,
            observedAt: latestIso,
            error: error.message || String(error),
          };
        }
      })
    );

    return {
      latestIso,
      valuesByCode: result,
      support: "partial",
      message: "当月側は直近積算・現在積雪深のみブラウザ判定しています。",
    };
  }

  return {
    latestIso,
    valuesByCode: result,
    support: "unsupported",
    message: "未対応要素です。",
  };
}

function pickAnnualMetric(metrics, elementKey) {
  switch (elementKey) {
    case "dailyPrecip":
      return metrics.dailyPrecip;
    case "max10mPrecip":
      return metrics.max10mPrecip;
    case "max1hPrecip":
      return metrics.max1hPrecip;
    case "dailyMaxTempHigh":
    case "dailyMaxTempLow":
      return metrics.dailyMaxTemp;
    case "dailyMinTempHigh":
    case "dailyMinTempLow":
      return metrics.dailyMinTemp;
    case "dailyMinHumidity":
      return metrics.dailyMinHumidity;
    case "dailyMaxWind":
      return metrics.dailyMaxWind;
    case "dailyMaxGust":
      return metrics.dailyMaxGust;
    default:
      return null;
  }
}

// Infer the actual ten-minute observation time, rather than marking every
// daily extreme with the latest page-update time.
function timeOfPointExtreme(records, elementKey, latestIso) {
  const fields = {
    dailyMaxTempHigh: ['temp'], dailyMaxTempLow: ['temp'],
    dailyMinTempHigh: ['temp'], dailyMinTempLow: ['temp'],
    dailyMinHumidity: ['humidity'], dailyMaxWind: ['wind'],
    dailyMaxGust: ['gust', 'maxWind'], max10mPrecip: ['precipitation10m'],
  }[elementKey];
  if (elementKey === 'max1hPrecip' && records?.length) {
    let best = null, bestTime = '';
    for (let i = 5; i < records.length; i++) {
      const values = records.slice(i - 5, i + 1).map(r => asNumber(r.data?.precipitation10m));
      if (!values.every(Number.isFinite)) continue;
      const total = sum(values);
      if (best === null || total > best) { best = total; bestTime = records[i].timeKey; }
    }
    if (/^\d{14}$/.test(bestTime)) return `${bestTime.slice(0,4)}-${bestTime.slice(4,6)}-${bestTime.slice(6,8)}T${bestTime.slice(8,10)}:${bestTime.slice(10,12)}:00+09:00`;
  }
  if (!fields || !records?.length) return latestIso;
  const low = ['dailyMinHumidity', 'dailyMinTempHigh', 'dailyMinTempLow'].includes(elementKey);
  let chosen = null;
  let best = null;
  for (const record of records) {
    const value = fields.map(f => asNumber(record.data?.[f])).find(Number.isFinite);
    if (value == null) continue;
    if (best === null || (low ? value < best : value > best)) {
      chosen = record.timeKey; best = value;
    }
  }
  const stamp = String(chosen || '');
  if (!/^\d{14}$/.test(stamp)) return latestIso;
  return `${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:00+09:00`;
}
