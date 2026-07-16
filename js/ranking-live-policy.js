import * as base from "./ranking.js?v=20260717-3";

export * from "./ranking.js?v=20260717-3";

function getSelectedRankingMonth() {
  const value = globalThis.document?.getElementById?.("monthSelect")?.value;
  return value ? String(value) : "all";
}

function getJstMonthFromDateLike(value) {
  const text = String(value || "").trim();

  const direct = text.match(/(?:^|\D)(\d{4})[\/.\-年](\d{1,2})(?:[\/.\-月]|月)/u);
  if (direct) {
    const month = Number(direct[2]);
    if (month >= 1 && month <= 12) return month;
  }

  const compact = text.match(/(?:^|\D)(\d{4})(\d{2})(\d{2})(?:\D|$)/u);
  if (compact) {
    const month = Number(compact[2]);
    if (month >= 1 && month <= 12) return month;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  try {
    return Number(new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
    }).format(parsed));
  } catch {
    return parsed.getMonth() + 1;
  }
}

function isLiveEligibleForMonth(liveCandidate, targetMonth) {
  if (!liveCandidate || !Number.isFinite(liveCandidate.value)) return false;
  if (String(targetMonth) === "all") return true;

  const observedMonth = getJstMonthFromDateLike(liveCandidate.observedAt);
  if (!Number.isInteger(observedMonth)) return false;
  return observedMonth === Number(targetMonth);
}

function applyMonthPolicyToRow(row, targetMonth) {
  if (!row?.liveCandidate) return row;

  const eligible = isLiveEligibleForMonth(row.liveCandidate, targetMonth);
  return {
    ...row,
    liveCandidate: {
      ...row.liveCandidate,
      observedMonth: getJstMonthFromDateLike(row.liveCandidate.observedAt),
      rankingEligible: eligible,
      rank: eligible ? row.liveCandidate.rank : null,
    },
  };
}

function applyMonthPolicyToRows(rows, targetMonth) {
  return (rows || []).map((row) => applyMonthPolicyToRow(row, targetMonth));
}

export function decorateRowsWithLive(...args) {
  return (base.decorateRowsWithLive(...args) || []).map((row) => {
    if (!row?.liveCandidate) return row;
    return {
      ...row,
      liveCandidate: {
        ...row.liveCandidate,
        observedMonth: getJstMonthFromDateLike(row.liveCandidate.observedAt),
      },
    };
  });
}

export function buildLiveSummaryItems(rows, elementKey, elementLabel, month) {
  return base.buildLiveSummaryItems(
    applyMonthPolicyToRows(rows, month),
    elementKey,
    elementLabel,
    month
  );
}

export function buildPrefectureAggregateRow(...args) {
  const row = base.buildPrefectureAggregateRow(...args);
  return row ? applyMonthPolicyToRow(row, getSelectedRankingMonth()) : row;
}

export function buildAreaAggregateRow(...args) {
  const row = base.buildAreaAggregateRow(...args);
  return row ? applyMonthPolicyToRow(row, getSelectedRankingMonth()) : row;
}

export function insertLiveIntoRankRows(rows) {
  return base.insertLiveIntoRankRows(
    applyMonthPolicyToRows(rows, getSelectedRankingMonth())
  );
}

export function hasAnyRankIn(rows) {
  return base.hasAnyRankIn(
    applyMonthPolicyToRows(rows, getSelectedRankingMonth())
  );
}

export function hasAnyTop1(rows) {
  return base.hasAnyTop1(
    applyMonthPolicyToRows(rows, getSelectedRankingMonth())
  );
}
