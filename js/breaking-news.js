// Provisional observation bulletins across all live-supported elements and
// both meaningful ranking periods (annual and the observation's JST month).
// This scanner is independent of the element/month currently displayed.
import { getElementListByMonth, loadStations, loadTable, findStationByRowName } from './data-loader.js?v=5';
import { buildLiveValuesForStations, fetchLatestObservationTime, isLiveSupported } from './live-source.js?v=5';
import { isLowBetter } from './ranking.js';
import { state } from './state.js';
import { parseRankValue, unique } from './utils.js';

let generation = 0;
const reports = new Map();
let lastRequest = null;
const jstDate = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const get = k => parts.find(p => p.type === k)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const jstMonth = (iso) => Number(jstDate(iso).slice(5,7)) || (new Date().getMonth() + 1);
const rowDay = (text) => {
  const s = String(text || '');
  const match = s.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? jstDate(s) : '';
};

// Comparison is against historical records from days *before* the current
// observation. Today's record may already have been uploaded in the source JSON.
export function assessProvisionalRank(value, ranks, elementKey, observationDay) {
  if (!Number.isFinite(value) || !observationDay) return null;
  const previous = (ranks || []).filter(r => rowDay(r?.date) !== observationDay)
    .map(r => parseRankValue(r?.value)).filter(Number.isFinite);
  if (!previous.length) return null; // Cannot establish previous record.
  const low = isLowBetter(elementKey);
  previous.sort((a,b) => low ? a-b : b-a);
  const betterOrEqual = n => low ? value <= n : value >= n;
  let rank = previous.findIndex(betterOrEqual) + 1;
  if (!rank && previous.length < 10) rank = previous.length + 1;
  if (!rank || rank > 10) return null;
  const strictlyNew = low ? value < previous[0] : value > previous[0];
  return { rank, top1: rank === 1 && strictlyNew, tiedFirst: rank === 1 && value === previous[0] };
}

function candidateTargets(iso) {
  const month = String(jstMonth(iso));
  const seen = new Set();
  const targets = [];
  for (const m of ['all', month]) {
    const elements = getElementListByMonth(m, state.elements);
    for (const [elementOrder, element] of elements.entries()) {
      if (!isLiveSupported(element.key, m)) continue;
      const key = `${m}|${element.key}`;
      if (!seen.has(key)) { seen.add(key); targets.push({ element, month: m, elementOrder }); }
    }
  }
  return targets;
}

async function scanPref(pref, targets, iso, day, isCurrent) {
  const {index} = await loadStations(pref.key,pref.region);
  const events = [];
  let failed = 0;
  const CONCURRENT = 3;
  let next = 0;
  const workers = Array.from({length: Math.min(CONCURRENT, targets.length)}, async () => {
    while (next < targets.length && isCurrent()) {
      const target = targets[next++];
      try {
        const {rows,missing} = await loadTable(pref.key,pref.region,target.element.key,target.month);
        if (missing) { failed++; continue; }
        if (!rows?.length) continue;
        const joined = rows.map(row => ({row,station:findStationByRowName(row.stationName,index)})).filter(x => x.station?.code);
        if (!joined.length || !isCurrent()) continue;
        const stationCodes = unique(joined.map(x => x.station.code));
        const live = await buildLiveValuesForStations({stationCodes,elementKey:target.element.key,month:target.month});
        if (!isCurrent() || live.support !== 'supported') continue;
        if (!stationCodes.some(code => Number.isFinite(live.valuesByCode?.[code]?.value))) {
          failed++; continue;
        }
        for (const {row,station} of joined) {
          const measured = live.valuesByCode?.[station.code];
          // Do not use a stale fallback cache: provisional alerts require direct measurements.
          const finding = assessProvisionalRank(measured?.value,row.ranks,target.element.key,day);
          if (!finding) continue;
          events.push({ ...finding, prefName:pref.name, prefKey:pref.key, region:pref.region, stationName:row.stationName, elementOrder:target.elementOrder,
            elementKey:target.element.key,elementLabel:target.element.label||target.element.shortLabel||target.element.key,
            month:target.month,monthLabel:target.month==='all'?'通年':`${target.month}月`,
            unit:target.element.unit || '',value:measured.value,observedAt:measured.observedAt || iso });
        }
      } catch (error) { failed++; console.warn('速報の個別要素の確認失敗:',pref.name,target.element.key,target.month,error); }
    }
  });
  await Promise.all(workers);
  return {events, failed};
}

function notify(report) {
  window.dispatchEvent(new CustomEvent('wx-breaking-news', {detail:report}));
  try {
    if (window.parent !== window) window.parent.postMessage({wxBreakingNews:true,kind:'report',report}, location.origin === 'null' ? '*' : location.origin);
  } catch (_) {}
}
function scopeKey(scope) { return `${scope.type}|${scope.region||''}|${scope.prefKey||''}`; }

// Returns immediately. A generation token discards results from stale selections.
export function scheduleBreakingNews(scope, prefMetas) {
  if (!state.elements || !prefMetas?.length) return;
  const signature = scopeKey(scope);
  if (signature === lastRequest?.signature && Date.now() - lastRequest.at < 70000) return;
  lastRequest = {signature,at:Date.now()};
  const token = ++generation;
  notify({ scope, status:'loading', items:[], scannedAt:'' });
  (async () => {
    try {
      const iso = await fetchLatestObservationTime();
      const cacheKey = `${signature}|${iso}`;
      const cached = reports.get(cacheKey);
      if (cached) { if (token === generation) notify({...cached,scope}); return; }
      const day = jstDate(iso);
      if (!day) throw new Error('実況の観測日時を確認できません');
      const targets = candidateTargets(iso);
      const items = [];
      let completedPrefectures = 0;
      let failures = 0;
      let prefCursor = 0;
      const isCurrent = () => token === generation;
      const prefWorkers = Array.from({length:Math.min(2,prefMetas.length)},async()=>{
        while (prefCursor < prefMetas.length && isCurrent()) {
          const pref = prefMetas[prefCursor++];
          const found = await scanPref(pref,targets,iso,day,isCurrent);
          if (!isCurrent()) break;
          items.push(...found.events);
          failures += found.failed;
          completedPrefectures++;
          // Show confirmed discoveries even before all prefectures finish scanning.
          if (completedPrefectures < prefMetas.length) notify({scope,status:'loading',items:items.slice(),scannedAt:iso,checkedPrefectures:completedPrefectures,totalPrefectures:prefMetas.length});
        }
      });
      await Promise.all(prefWorkers);
      if (!isCurrent()) return;
      const dedup = new Map();
      for (const item of items) {
        const k = [item.prefKey,item.stationName,item.elementKey,item.month,day].join('|');
        const prev = dedup.get(k);
        if (!prev || item.top1 && !prev.top1 || item.rank < prev.rank) dedup.set(k,item);
      }
      const ordered = [...dedup.values()].sort((a,b)=> Number(b.top1)-Number(a.top1) || a.rank-b.rank ||
        a.prefName.localeCompare(b.prefName,'ja') || a.elementLabel.localeCompare(b.elementLabel,'ja') || a.stationName.localeCompare(b.stationName,'ja') || a.month.localeCompare(b.month));
      const report = {scope,status:failures?'partial':'ready',items:ordered,scannedAt:iso,checkedTargets:targets.length,checkedPrefectures:prefMetas.length,failedTargets:failures};
      reports.set(cacheKey,report);
      if (reports.size > 8) reports.delete(reports.keys().next().value);
      notify(report);
    } catch (error) {
      if (token === generation) notify({scope,status:'error',items:[],message:error?.message||String(error)});
    }
  })();
}
