// Daily extrema published by JMA, served through GitHub Actions as a local JSON
// to avoid cross-origin restrictions and Shift_JIS decoding in the browser.
const SNAPSHOT_PATH = './data/live/official_extrema.json';
const METRICS = Object.freeze({
  dailyMaxTempHigh:'dailyMaxTemp', dailyMaxTempLow:'dailyMaxTemp',
  dailyMinTempHigh:'dailyMinTemp', dailyMinTempLow:'dailyMinTemp',
  dailyMaxWind:'dailyMaxWind', dailyMaxGust:'dailyMaxGust',
  dailyPrecip:'dailyPrecip', max1hPrecip:'max1hPrecip',
  max24hPrecip:'max24hPrecip',
  monthMax3hPrecip:'max3hPrecip', monthMax6hPrecip:'max6hPrecip',
  monthMax12hPrecip:'max12hPrecip', monthMax24hPrecip:'max24hPrecip',
  monthMax48hPrecip:'max48hPrecip', monthMax72hPrecip:'max72hPrecip',
});
const LOW_METRICS = new Set(['dailyMinTemp']);
let cache = null, cachedAt = 0, pending = null;

export function jstDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
  }).formatToParts(date);
  const get = key => parts.find(p=>p.type===key)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function loadOfficialExtrema() {
  if (Date.now() - cachedAt < 90000) return cache;
  if (pending) return pending;
  pending = (async () => {
    try {
      const res = await fetch(`${SNAPSHOT_PATH}?t=${Date.now()}`,{cache:'no-store'});
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cache = data?.schema===1 && data?.stations && typeof data.stations==='object' ? data : null;
    } catch (error) {
      console.warn('気象庁公表実況を取得できません。参考実況へ切替:',error);
      cache = null;
    } finally { cachedAt=Date.now();pending=null; }
    return cache;
  })();
  return pending;
}

/** Use a complete JMA daily result by default.  A more-extreme *later*
 * 10-minute measurement overrides the published as-of snapshot temporarily.
 * The comparison follows the physical statistic (daily max/min), not the
 * ascending/descending historical ranking direction.
 */
export function choosePublishedExtremum({snapshot,stationCode,elementKey,latestIso,fallback}) {
  const previous = fallback || {value:null,observedAt:latestIso};
  const metric = METRICS[elementKey];
  if (!metric) return previous;
  const latestDay=jstDay(latestIso);
  if (!latestDay || snapshot?.observedDate!==latestDay) return previous;
  const official=snapshot.stations?.[String(stationCode)]?.[metric];
  if (!official || !Number.isFinite(official.value) || ![5,8].includes(official.quality) ||
      jstDay(official.observedAt)!==latestDay || jstDay(official.publishedAt)!==latestDay) return previous;

  const fallbackValue=previous.value;
  const moreExtreme=Number.isFinite(fallbackValue) && (LOW_METRICS.has(metric)
    ? fallbackValue < official.value - 1e-8 : fallbackValue > official.value + 1e-8);
  const afterPublished=Number.isFinite(Date.parse(previous.observedAt)) &&
    Number.isFinite(Date.parse(official.publishedAt)) &&
    Date.parse(previous.observedAt)>Date.parse(official.publishedAt);
  if (moreExtreme && afterPublished) return previous;

  const resolution=official.sourceResolution || 'minute';
  const sourceLabel=resolution==='minute' ? '気象庁公表・分単位の極値起時'
    : resolution==='ten-minute-official' ? '気象庁公表・10分間隔の極値起時'
    : '気象庁公表・集計時点';
  return {...previous,value:official.value,observedAt:official.observedAt,
    publishedAt:official.publishedAt,quality:official.quality,
    sourceResolution:resolution,sourceLabel};
}
