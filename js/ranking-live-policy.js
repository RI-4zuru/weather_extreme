import * as base from "./ranking.js?v=20260717-4";

export * from "./ranking.js?v=20260717-4";

function makeReferenceOnly(row) {
  if (!row?.liveCandidate) return row;
  return {
    ...row,
    liveCandidate: {
      ...row.liveCandidate,
      rankingEligible: false,
      rank: null,
    },
  };
}

function makeRowsReferenceOnly(rows) {
  return (rows || []).map((row) => makeReferenceOnly(row));
}

// 実況値は右端の参考列にだけ残し、歴代1〜10位には挿入しない。
export function decorateRowsWithLive(...args) {
  return makeRowsReferenceOnly(base.decorateRowsWithLive(...args));
}

// 実況ランクイン一覧は廃止する。
export function buildLiveSummaryItems() {
  return [];
}

export function buildPrefectureAggregateRow(...args) {
  return makeReferenceOnly(base.buildPrefectureAggregateRow(...args));
}

export function buildAreaAggregateRow(...args) {
  return makeReferenceOnly(base.buildAreaAggregateRow(...args));
}

// 順位配列は歴代記録のまま返す。
export function insertLiveIntoRankRows(rows) {
  return makeRowsReferenceOnly(rows);
}

export function hasAnyRankIn() {
  return false;
}

export function hasAnyTop1() {
  return false;
}
