import { LOW_IS_BETTER_KEYS, LIVE_SUMMARY_ORDER } from "./constants.js";

export function isLowBetter(elementKey) {
  return LOW_IS_BETTER_KEYS.has(elementKey);
}

function parseValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).replaceAll(",", "").trim();
  if (!text) return null;

  const matched = text.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;

  const num = Number(matched[0]);
  return Number.isFinite(num) ? num : null;
}

function parseDateLike(dateText) {
  if (!dateText) return null;
  const text = String(dateText).trim();

  let m = text.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const dt = new Date(year, month - 1, day);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  m = text.match(/(\d{4})[\/\-](\d{1,2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const dt = new Date(year, month - 1, 1);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  m = text.match(/(\d{4})/);
  if (m) {
    const year = Number(m[1]);
    const dt = new Date(year, 0, 1);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getStationCodeNumber(stationCode) {
  if (stationCode === null || stationCode === undefined) return -1;
  const num = Number(String(stationCode).replace(/\D/g, ""));
  return Number.isFinite(num) ? num : -1;
}

function compareEntries(a, b, elementKey) {
  const lowBetter = isLowBetter(elementKey);

  if (a.numericValue !== b.numericValue) {
    return lowBetter
      ? a.numericValue - b.numericValue
      : b.numericValue - a.numericValue;
  }

  const aTime = a.sortDate ? a.sortDate.getTime() : -1;
  const bTime = b.sortDate ? b.sortDate.getTime() : -1;
  if (aTime !== bTime) {
    return bTime - aTime;
  }

  if (a.stationCodeNumber !== b.stationCodeNumber) {
    return b.stationCodeNumber - a.stationCodeNumber;
  }

  return String(a.stationName || "").localeCompare(String(b.stationName || ""), "ja");
}

function getHighlightStartDate(mode, latestObservationTime) {
  const base = normalizeTimestamp(latestObservationTime) || new Date();

  if (mode === "current-year") {
    return new Date(base.getFullYear(), 0, 1, 0, 0, 0, 0);
  }

  if (mode === "current-month") {
    return new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0);
  }

  const rolling = new Date(base);
  rolling.setFullYear(rolling.getFullYear() - 1);
  return rolling;
}

export function applyHighlightModeToRows(rows, highlightMode, latestObservationTime) {
  const startDate = getHighlightStartDate(highlightMode, latestObservationTime);

  return (rows || []).map((row) => ({
    ...row,
    ranks: (row.ranks || []).map((rankItem) => {
      const parsedDate = parseDateLike(rankItem?.date || "");
      const highlightWithinYear = !!(parsedDate && parsedDate.getTime() >= startDate.getTime());

      return {
        ...rankItem,
        highlightWithinYear,
      };
    }),
  }));
}

export function judgeLiveRank(liveValue, row, elementKey) {
  if (!Number.isFinite(liveValue)) {
    return null;
  }

  const ranks = Array.isArray(row?.ranks) ? row.ranks : [];
  const parsed = ranks
    .map((rankItem, index) => ({
      index,
      value: parseValue(rankItem?.value),
    }))
    .filter((item) => Number.isFinite(item.value));

  if (parsed.length === 0) {
    return null;
  }

  if (isLowBetter(elementKey)) {
    for (let i = 0; i < parsed.length; i += 1) {
      if (liveValue <= parsed[i].value) return i + 1;
    }
  } else {
    for (let i = 0; i < parsed.length; i += 1) {
      if (liveValue >= parsed[i].value) return i + 1;
    }
  }

  return null;
}

export function decorateRowsWithLive(rows, stationIndex, liveValuesByCode, elementKey, supportMode) {
  return (rows || []).map((row) => {
    const station = stationIndex ? stationIndex(row.stationName) : null;
    const code = station?.code || null;
    const live = code ? liveValuesByCode?.[code] : null;

    const liveValue = live?.value;
    const insertionRank = Number.isFinite(liveValue)
      ? judgeLiveRank(liveValue, row, elementKey)
      : null;

    return {
      ...row,
      stationCode: code,
      elementKey,
      liveCandidate: {
        supportMode,
        supported: supportMode !== "unsupported" && supportMode !== "error",
        value: liveValue,
        rank: insertionRank,
        observedAt: live?.observedAt || "",
        error: live?.error || "",
      },
    };
  });
}

export function buildPrefectureAggregateRow(rows, prefName, elementKey) {
  const historicalEntries = [];

  for (const row of rows || []) {
    for (const rankItem of row.ranks || []) {
      const numericValue = parseValue(rankItem?.value);
      if (!Number.isFinite(numericValue)) continue;

      historicalEntries.push({
        numericValue,
        rawValue: rankItem?.value ?? "-",
        date: rankItem?.date || "-",
        sortDate: parseDateLike(rankItem?.date || ""),
        stationName: row.stationName || "-",
        stationCodeNumber: getStationCodeNumber(row.stationCode),
        highlightWithinYear: !!rankItem?.highlightWithinYear,
      });
    }
  }

  if (!historicalEntries.length) {
    return null;
  }

  const cleanHistory = dedupeAggregateHistory(historicalEntries, elementKey);
  cleanHistory.sort((a, b) => compareEntries(a, b, elementKey));

  const aggregateRanks = cleanHistory.slice(0, 10).map((item) => ({
    value: item.rawValue,
    date: item.date,
    stationName: item.stationName,
    highlightWithinYear: item.highlightWithinYear,
  }));

  const liveEntries = (rows || [])
    .map((row) => ({
      stationName: row.stationName || "-",
      stationCodeNumber: getStationCodeNumber(row.stationCode),
      live: row.liveCandidate || {},
      numericValue: Number.isFinite(row?.liveCandidate?.value) ? row.liveCandidate.value : null,
      sortDate: normalizeTimestamp(row?.liveCandidate?.observedAt || ""),
    }))
    .filter((item) => Number.isFinite(item.numericValue));

  liveEntries.sort((a, b) =>
    compareEntries(
      {
        numericValue: a.numericValue,
        sortDate: a.sortDate,
        stationCodeNumber: a.stationCodeNumber,
        stationName: a.stationName,
      },
      {
        numericValue: b.numericValue,
        sortDate: b.sortDate,
        stationCodeNumber: b.stationCodeNumber,
        stationName: b.stationName,
      },
      elementKey
    )
  );

  const bestLive = liveEntries[0] || null;

  const aggregateLiveCandidate = bestLive
    ? {
        ...bestLive.live,
        stationName: bestLive.stationName,
        rank: judgeLiveRank(bestLive.numericValue, { ranks: aggregateRanks }, elementKey),
      }
    : {
        supportMode: rows?.[0]?.liveCandidate?.supportMode || "unsupported",
        supported: rows?.[0]?.liveCandidate?.supported || false,
        value: null,
        rank: null,
        observedAt: "",
        error: "",
        stationName: "",
      };

  return {
    stationName: prefName,
    elementKey,
    startDate: "県内総合",
    stationCode: "",
    isPrefectureAggregate: true,
    ranks: aggregateRanks,
    liveCandidate: aggregateLiveCandidate,
  };
}

export function buildAreaAggregateRow(rows, areaName, areaLabel, elementKey) {
  const historicalEntries = [];

  for (const row of rows || []) {
    for (const rankItem of row.ranks || []) {
      const numericValue = parseValue(rankItem?.value);
      if (!Number.isFinite(numericValue)) continue;

      const prefName = row.prefName || row.sourcePrefName || "";
      const stationName = rankItem.stationName || row.stationName || "-";
      const stationWithPref = prefName
        ? `${stationName}（${prefName}）`
        : stationName;

      historicalEntries.push({
        numericValue,
        rawValue: rankItem?.value ?? "-",
        date: rankItem?.date || "-",
        sortDate: parseDateLike(rankItem?.date || ""),
        stationName: stationWithPref,
        stationCodeNumber: getStationCodeNumber(row.stationCode),
        highlightWithinYear: !!rankItem?.highlightWithinYear,
      });
    }
  }

  if (!historicalEntries.length) {
    return null;
  }

  const cleanHistory = dedupeAggregateHistory(historicalEntries, elementKey);
  cleanHistory.sort((a, b) => compareEntries(a, b, elementKey));

  const aggregateRanks = cleanHistory.slice(0, 10).map((item) => ({
    value: item.rawValue,
    date: item.date,
    stationName: item.stationName,
    highlightWithinYear: item.highlightWithinYear,
  }));

  const liveEntries = (rows || [])
    .map((row) => {
      const live = row.liveCandidate || {};
      const prefName = row.prefName || row.sourcePrefName || "";
      const stationName = live.stationName || row.stationName || "-";
      const stationWithPref = prefName
        ? `${stationName}（${prefName}）`
        : stationName;

      return {
        stationName: stationWithPref,
        stationCodeNumber: getStationCodeNumber(row.stationCode),
        live,
        numericValue: Number.isFinite(live.value) ? live.value : null,
        sortDate: normalizeTimestamp(live.observedAt || ""),
      };
    })
    .filter((item) => Number.isFinite(item.numericValue));

  liveEntries.sort((a, b) =>
    compareEntries(
      {
        numericValue: a.numericValue,
        sortDate: a.sortDate,
        stationCodeNumber: a.stationCodeNumber,
        stationName: a.stationName,
      },
      {
        numericValue: b.numericValue,
        sortDate: b.sortDate,
        stationCodeNumber: b.stationCodeNumber,
        stationName: b.stationName,
      },
      elementKey
    )
  );

  const bestLive = liveEntries[0] || null;

  const aggregateLiveCandidate = bestLive
    ? {
        ...bestLive.live,
        stationName: bestLive.stationName,
        rank: judgeLiveRank(bestLive.numericValue, { ranks: aggregateRanks }, elementKey),
      }
    : {
        supportMode: rows?.[0]?.liveCandidate?.supportMode || "unsupported",
        supported: rows?.[0]?.liveCandidate?.supported || false,
        value: null,
        rank: null,
        observedAt: "",
        error: "",
        stationName: "",
      };

  return {
    stationName: areaName,
    elementKey,
    startDate: areaLabel,
    stationCode: "",
    isAreaAggregate: true,
    isPrefectureAggregate: true,
    ranks: aggregateRanks,
    liveCandidate: aggregateLiveCandidate,
  };
}

export function buildLiveSummaryItems(rows, elementKey, elementLabel, month) {
  const items = [];

  for (const row of rows || []) {
    const live = row.liveCandidate;
    if (!live || !Number.isFinite(live.value) || !Number.isFinite(live.rank)) continue;
    if (live.rank < 1 || live.rank > 10) continue;

    items.push({
      elementKey,
      elementLabel,
      stationName: row.stationName || "-",
      rank: live.rank,
      value: live.value,
      observedAt: live.observedAt || "",
      month,
      monthLabel: month === "all" ? "通年" : "当月",
      top1: live.rank === 1,
    });
  }

  items.sort((a, b) => {
    const orderA = LIVE_SUMMARY_ORDER.indexOf(a.elementKey);
    const orderB = LIVE_SUMMARY_ORDER.indexOf(b.elementKey);
    if (orderA !== orderB) return orderA - orderB;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return String(a.stationName).localeCompare(String(b.stationName), "ja");
  });

  return items;
}

export function hasAnyRankIn(rows) {
  return (rows || []).some((row) => {
    const rank = row?.liveCandidate?.rank;
    return Number.isFinite(rank) && rank >= 1 && rank <= 10;
  });
}

export function hasAnyTop1(rows) {
  return (rows || []).some((row) => row?.liveCandidate?.rank === 1);
}

// Use JST calendar dates to compare live ISO timestamps with dated historical records.
// One station can appear only once on a given observation day in the same ranking.
function recordDayJst(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const timestamp = new Date(text);
    if (!Number.isNaN(timestamp.getTime())) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(timestamp);
      const part = (type) => parts.find((item) => item.type === type)?.value || "";
      return `${part("year")}-${part("month")}-${part("day")}`;
    }
  }
  const match = text.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

function sameStation(nameA, nameB) {
  return String(nameA || "").replace(/[\s（）]/g, "").replace(/\(/g, "").replace(/\)/g, "") ===
    String(nameB || "").replace(/[\s（）]/g, "").replace(/\(/g, "").replace(/\)/g, "");
}

// Suppress repeated records in aggregate source rows, keeping the strongest value.
function dedupeAggregateHistory(entries, elementKey) {
  const seen = new Map();
  const better = isLowBetter(elementKey)
    ? (a, b) => a.numericValue < b.numericValue
    : (a, b) => a.numericValue > b.numericValue;
  for (const entry of entries) {
    const day = recordDayJst(entry.date);
    const identity = entry.stationCodeNumber >= 0 ? `#${entry.stationCodeNumber}` : entry.stationName;
    const key = day ? `${identity}::${day}` : null;
    if (!key) { seen.set(Symbol(), entry); continue; }
    const previous = seen.get(key);
    if (!previous || better(entry, previous)) seen.set(key, entry);
  }
  return [...seen.values()];
}

export function insertLiveIntoRankRows(rows) {
  return (rows || []).map((row) => {
    const live = row.liveCandidate;
    if (!live || !Number.isFinite(live.value) || !Number.isFinite(live.rank) ||
        live.rank < 1 || live.rank > 10) return row;

    const stationName = row.isAreaAggregate || row.isPrefectureAggregate
      ? (live.stationName || "") : (row.stationName || "");
    const liveDay = recordDayJst(live.observedAt);
    // The same aggregate can be passed through this function twice (area -> nation).
    // Remove inserted live items before inserting one canonical entry.
    const candidates = (row.ranks || []).filter((item) => !item.isLiveRank);
    const onSameDay = (item) => liveDay && recordDayJst(item.date) === liveDay &&
      sameStation(item.stationName || row.stationName, stationName);
    const previouslyRanked = candidates.filter(onSameDay);
    const remaining = candidates.filter((item) => !onSameDay(item));
    const bestPrevious = previouslyRanked.reduce((best, item) => {
      const value = parseValue(item.value);
      if (!Number.isFinite(value)) return best;
      if (!best || (isLowBetter(row.elementKey || "") ? value < best.value : value > best.value))
        return { item, value };
      return best;
    }, null);
    // Historic ranking may already contain a stronger value for the same station/day.
    // Retain that one rather than overwrite it with a potentially stale live reading.
    if (bestPrevious && (isLowBetter(row.elementKey || "")
      ? bestPrevious.value < live.value : bestPrevious.value > live.value)) {
      const index = judgeLiveRank(bestPrevious.value, { ranks: remaining }, row.elementKey || "");
      const restored = [...remaining];
      restored.splice(Math.max(0, (index || live.rank) - 1), 0, bestPrevious.item);
      return { ...row, ranks: restored.slice(0, 10) };
    }

    // Recompute after deleting duplicates, otherwise a tied preexisting record
    // incorrectly advances the insertion rank or produces two identical cells.
    const position = judgeLiveRank(live.value, { ranks: remaining }, row.elementKey || "");
    const insertAt = (position || Math.min(live.rank, remaining.length + 1)) - 1;
    const liveRankItem = {
      value: live.value,
      date: live.observedAt || "",
      stationName: row.isAreaAggregate || row.isPrefectureAggregate ? stationName : "",
      highlightWithinYear: false,
      isLiveRank: true,
    };
    const nextRanks = [...remaining];
    nextRanks.splice(insertAt, 0, liveRankItem);
    return { ...row, ranks: nextRanks.slice(0, 10) };
  });
}
