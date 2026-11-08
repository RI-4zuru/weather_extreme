export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function fetchJson(pathOrUrl) {
  const response = await fetch(`${pathOrUrl}${pathOrUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${pathOrUrl}`);
  }
  return await response.json();
}

export async function fetchText(pathOrUrl) {
  const response = await fetch(`${pathOrUrl}${pathOrUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${pathOrUrl}`);
  }
  return await response.text();
}

export function normalizeStationName(text) {
  return String(text ?? "")
    .trim()
    .replaceAll(/\s+/g, "")
    .replaceAll("　", "")
    .replaceAll("（", "(")
    .replaceAll("）", ")");
}

export function asNumber(value) {
  if (Array.isArray(value)) {
    return asNumber(value[0]);
  }
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseRankValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).replaceAll(",", "").trim();
  if (!text) return null;
  const matched = text.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const num = Number(matched[0]);
  return Number.isFinite(num) ? num : null;
}

export function formatDateTimeJst(isoText) {
  if (!isoText) return "-";
  const d = new Date(isoText);
  if (Number.isNaN(d.getTime())) return String(isoText);
  // Explicit JST so browser/OS timezone cannot display the wrong occurrence.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(d);
  const v = key => parts.find(p => p.type === key)?.value || '00';
  return `${v('year')}年${v('month')}月${v('day')}日 ${v('hour')}:${v('minute')}`;
}

export function formatObservationLabel(isoText) {
  return isoText ? `${formatDateTimeJst(isoText)} 時点` : "-";
}

export function toJmaMapTimestamp(isoText) {
  const d = new Date(isoText);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}${hh}${mm}00`;
}

export function toJmaPointSlot(isoText) {
  const d = new Date(isoText);
  const baseHour = Math.floor(d.getHours() / 3) * 3;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(baseHour).padStart(2, "0");
  return `${y}${m}${day}_${hh}`;
}

export function getTodayPointSlots(latestIso) {
  const latest = new Date(latestIso);
  const start = new Date(latest);
  start.setHours(0, 0, 0, 0);
  const result = [];
  const cursor = new Date(start);
  while (cursor <= latest) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    const h = String(cursor.getHours()).padStart(2, "0");
    result.push(`${y}${m}${d}_${h}`);
    cursor.setHours(cursor.getHours() + 3);
  }
  return result;
}

export function renderDualLine(text) {
  if (!text) return "-";
  const raw = String(text).trim();
  const m1 = raw.match(/^(.+?)(（.+）)$/);
  if (!m1) return escapeHtml(raw);
  return `${escapeHtml(m1[1])}<br>${escapeHtml(m1[2])}`;
}

export function monthLabel(month) {
  return month === "all" ? "通年" : `${month}月`;
}

export function unique(array) {
  return [...new Set(array)];
}

export function compareNumbersAsc(a, b) {
  return a - b;
}

export function compareNumbersDesc(a, b) {
  return b - a;
}

export function sum(values) {
  return values.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
}

export function max(values) {
  const filtered = values.filter((v) => Number.isFinite(v));
  return filtered.length ? Math.max(...filtered) : null;
}

export function min(values) {
  const filtered = values.filter((v) => Number.isFinite(v));
  return filtered.length ? Math.min(...filtered) : null;
}

export function rollingMax(values, windowSize) {
  if (!Array.isArray(values) || values.length === 0) return null;
  let best = null;
  for (let i = 0; i <= values.length - windowSize; i += 1) {
    const current = sum(values.slice(i, i + windowSize));
    if (best === null || current > best) best = current;
  }
  return best;
}
