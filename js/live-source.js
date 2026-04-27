import {
  JMA_ENDPOINTS,
  LIVE_SUPPORTED_ANNUAL_KEYS,
  LIVE_SUPPORTED_MONTHLY_KEYS,
} from "./constants.js";
import { state } from "./state.js";
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

  const text = await fetchText(JMA_ENDPOINTS.latestTime);
  const iso = text.trim();
  state.latestTimeCache = {
    iso,
    fetchedAt: now,
  };
  return iso;
}

export async function fetchLatestMap(latestIso) {
  if (
    state.latestMapCache.iso === latestIso &&
    state.latestMapCache.data
  ) {
    return state.latestMapCache.data;
  }

  const timestamp = toJmaMapTimestamp(latestIso);
  const data = await fetchJson(JMA_ENDPOINTS.map(timestamp));
  state.latestMapCache = {
    iso: latestIso,
    data,
    fetchedAt: Date.now(),
  };
  return data;
}

async function fetchPointChunk(stationCode, slot) {
  const cacheKey = `${stationCode}|${slot}`;
  if (state.pointChunkCache.has(cacheKey)) {
    return state.pointChunkCache.get(cacheKey);
  }

  state.debug.pointFetchCount += 1;
  const data = await fetchJson(JMA_ENDPOINTS.point(stationCode, slot));
  state.pointChunkCache.set(cacheKey, data);
  return data;
}

async function fetchTodayPointRecords(stationCode, latestIso) {
  const cacheKey = `${stationCode}|today|${latestIso.slice(0, 10)}`;
  if (state.pointDailyCache.has(cacheKey)) {
    return state.pointDailyCache.get(cacheKey);
  }

  const slots = getTodayPointSlots(latestIso);
  const chunks = await Promise.all(
    slots.map((slot) =>
      fetchPointChunk(stationCode, slot).catch(() => null)
    )
  );

  const rows = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    for (const [timeKey, item] of Object.entries(chunk)) {
      rows.push({
        timeKey,
        data: item || {},
      });
    }
  }

  rows.sort((a, b) => String(a.timeKey).localeCompare(String(b.timeKey), "ja"));
  state.pointDailyCache.set(cacheKey, rows);
  return rows;
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

  return {
    dailyPrecip: sum(precip10m),
    max10mPrecip: max(precip10m),
    max1hPrecip: rollingMax(
      precip10m.map((v) => (Number.isFinite(v) ? v : 0)),
      6
    ),
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
  const mapData = await fetchLatestMap(latestIso);
  const result = {};

  if (!isLiveSupported(elementKey, month)) {
    return {
      latestIso,
      valuesByCode: result,
      support: "unsupported",
      message: "この要素の実況判定はブラウザ単独版では未対応です。",
    };
  }

  // ===== ここが重要：elementKeyで分岐 =====

  const isAnnual = LIVE_SUPPORTED_ANNUAL_KEYS.has(elementKey);
  const isMonthly = LIVE_SUPPORTED_MONTHLY_KEYS.has(elementKey);

  // ------------------------
  // ■ 通年系（気温・風・湿度・短時間雨）
  // → 月選択でもここに入る
  // ------------------------
  if (isAnnual) {
    await Promise.all(
      stationCodes.map(async (stationCode) => {
        try {
          const records = await fetchTodayPointRecords(stationCode, latestIso);
          const metrics = calcDailyMetrics(records);

          const value = pickAnnualMetric(metrics, elementKey);

          result[stationCode] = {
            value,
            observedAt: latestIso,
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
      support: "supported",
      message: "当日0時以降の point JSON から実況判定しています。",
    };
  }

  // ------------------------
  // ■ 月系（長時間雨・雪）
  // ------------------------
  if (isMonthly && month !== "all") {
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
