import * as base from "./ranking.js";

// 元のランキング処理はすべて公開したまま、実況の順位判定だけを
// 「通年」または実況の観測月に限定する。
export * from "./ranking.js";

function parseMonth(value) {
  const text = String(value || "").trim();
  const direct = text.match(/(?:^|\D)(?:\d{4})[\/.\-年](\d{1,2})(?:[\/.\-月]|月)/u);
  if (direct) {
    const month = Number(direct[1]);
    if (month >= 1 && month <= 12) return month;
  }

  const compact = text.match(/(?:^|\D)\d{4}(\d{2})\d{2}(?:\D|$)/u);
  if (compact) {
    const month = Number(compact[1]);
    if (month >= 1 && month <= 12) return month;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    try {
      return Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
      }).format(parsed));
    } catch {
      return parsed.getMonth() + 1;
    }
  }

  return null;
}

function currentJstMonth() {
  try {
    return Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
    }).format(new Date()));
  } catch {
    return new Date().getMonth() + 1;
  }
}

function selectedMonth() {
  return String(document.getElementById("monthSelect")?.value || "all");
}

function observedMonthFromRows(rows) {
  for (const row of rows || []) {
    const month = parseMonth(row?.liveCandidate?.observedAt);
    if (month) return month;
  }

  const headerMonth = parseMonth(document.getElementById("observedLatestAt")?.textContent);
  return headerMonth || currentJstMonth();
}

function isEligible(month, observedMonth) {
  const normalized = String(month || "all");
  return normalized === "all" || Number(normalized) === Number(observedMonth);
}

function removeRanksWhenReferenceOnly(rows, month = selectedMonth()) {
  const observedMonth = observedMonthFromRows(rows);
  if (isEligible(month, observedMonth)) return rows;

  return (rows || []).map((row) => ({
    ...row,
    liveCandidate: row?.liveCandidate
      ? {
          ...row.liveCandidate,
          rank: null,
          rankingEligible: false,
          observedMonth,
        }
      : row?.liveCandidate,
  }));
}

function normalizeAggregateLive(row, sourceRows) {
  if (!row) return row;
  const month = selectedMonth();
  const observedMonth = observedMonthFromRows(sourceRows);
  if (isEligible(month, observedMonth)) return row;

  return {
    ...row,
    liveCandidate: row.liveCandidate
      ? {
          ...row.liveCandidate,
          rank: null,
          rankingEligible: false,
          observedMonth,
        }
      : row.liveCandidate,
  };
}

export function decorateRowsWithLive(rows, stationIndex, liveValuesByCode, elementKey, supportMode) {
  const decorated = base.decorateRowsWithLive(
    rows,
    stationIndex,
    liveValuesByCode,
    elementKey,
    supportMode
  );
  return removeRanksWhenReferenceOnly(decorated);
}

export function buildPrefectureAggregateRow(rows, prefName, elementKey) {
  return normalizeAggregateLive(
    base.buildPrefectureAggregateRow(rows, prefName, elementKey),
    rows
  );
}

export function buildAreaAggregateRow(rows, areaName, areaLabel, elementKey) {
  return normalizeAggregateLive(
    base.buildAreaAggregateRow(rows, areaName, areaLabel, elementKey),
    rows
  );
}

export function buildLiveSummaryItems(rows, elementKey, elementLabel, month) {
  const observedMonth = observedMonthFromRows(rows);
  if (!isEligible(month, observedMonth)) return [];
  return base.buildLiveSummaryItems(rows, elementKey, elementLabel, month);
}

export function insertLiveIntoRankRows(rows) {
  const eligibleRows = removeRanksWhenReferenceOnly(rows);
  return base.insertLiveIntoRankRows(eligibleRows);
}
