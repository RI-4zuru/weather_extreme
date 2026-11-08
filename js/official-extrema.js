// JMA's published daily extremes have occurrence times to the minute. This
// snapshot is generated on GitHub Actions to avoid cross-origin CSV/CORS and
// Shift_JIS parsing on GitHub Pages. Missing/stale snapshots never overwrite
// direct ten-minute reference observations.
const SNAPSHOT_PATH = './data/live/official_extrema.json';
const METRICS = Object.freeze({
  dailyMaxTempHigh: 'dailyMaxTemp',
  dailyMaxTempLow: 'dailyMaxTemp',
  dailyMinTempHigh: 'dailyMinTemp',
  dailyMinTempLow: 'dailyMinTemp',
  dailyMaxWind: 'dailyMaxWind',
  dailyMaxGust: 'dailyMaxGust',
  max1hPrecip: 'max1hPrecip',
});
// This direction is about the meteorological metric (daily maximum vs
// daily minimum), NOT the ranking's high/low direction.
const LOW_METRICS = new Set(['dailyMinTemp']);
let cache = null;
let cachedAt = 0;
let pending = null;

export function jstDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function loadOfficialExtrema() {
  if (Date.now() - cachedAt < 90000) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const response = await fetch(`${SNAPSHOT_PATH}?t=${Date.now()}`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      cache = data?.schema === 1 && data?.stations && typeof data.stations === 'object' ? data : null;
    } catch (error) {
      console.warn('気象庁公表極値を取得できません（10分値へ切替）:', error);
      cache = null;
    } finally {
      cachedAt = Date.now();
      pending = null;
    }
    return cache;
  })();
  return pending;
}

// Official time reflects when the extreme occurred; the point fallback's
// observedAt reflects when the selected fallback value was observed.
export function choosePublishedExtremum({snapshot, stationCode, elementKey, latestIso, fallback}) {
  const previous = fallback || {value: null, observedAt: latestIso};
  const metric = METRICS[elementKey];
  if (!metric) return previous;
  const latestDay = jstDay(latestIso);
  if (!latestDay || snapshot?.observedDate !== latestDay) return previous;
  const official = snapshot.stations?.[String(stationCode)]?.[metric];
  if (!official || !Number.isFinite(official.value) ||
      ![5, 8].includes(official.quality) ||
      jstDay(official.observedAt) !== latestDay ||
      jstDay(official.publishedAt) !== latestDay) return previous;

  // A new extreme observed by the 10-minute reference may be more recent than
  // the still-hourly official report. Do not suppress that new reference value.
  const fallbackValue = previous.value;
  if (Number.isFinite(fallbackValue)) {
    const isMoreExtreme = LOW_METRICS.has(metric)
      ? fallbackValue < official.value - 1e-8
      : fallbackValue > official.value + 1e-8;
    if (isMoreExtreme) return previous;
  }
  return {
    ...previous,
    value: official.value,
    observedAt: official.observedAt,
    publishedAt: official.publishedAt,
    quality: official.quality,
    sourceResolution: 'minute',
    sourceLabel: '気象庁公表・分単位の起時',
  };
}
