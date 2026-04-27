export const DEFAULT_REGION = "近畿";
export const DEFAULT_PREF = "osaka";
export const DEFAULT_MONTH = "all";
export const DEFAULT_ANNUAL_ELEMENT = "dailyPrecip";
export const DEFAULT_MONTHLY_ELEMENT = "monthMax24hPrecip";

export const PATHS = {
  prefectures: "./config/prefectures.json",
  elements: "./config/elements.json",
  manifest: "./data/manifest.json",
  stations: (prefKey) => `./config/stations/${prefKey}.json`,
  table: (prefKey, elementKey, month) => `./data/${prefKey}/${elementKey}-${month}.json`,
};

export const JMA_ENDPOINTS = {
  latestTime: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
  map: (timestamp) => `https://www.jma.go.jp/bosai/amedas/data/map/${timestamp}.json`,
  point: (amedasCode, ymdHour) =>
    `https://www.jma.go.jp/bosai/amedas/data/point/${amedasCode}/${ymdHour}.json`,
};

export const ELEMENT_DESCRIPTIONS = {
  dailyPrecip: "当日0時からの10分降水量積算で実況判定します。",
  max10mPrecip: "当日0時から最新時刻までの10分降水量最大値で実況判定します。",
  max1hPrecip: "当日0時から最新時刻までの60分積算降水量最大値で実況判定します。",
  dailyMaxTempHigh: "当日0時から最新時刻までの日最高気温で実況判定します。",
  dailyMaxTempLow: "当日0時から最新時刻までの日最高気温で実況判定します。",
  dailyMinTempHigh: "当日0時から最新時刻までの日最低気温で実況判定します。",
  dailyMinTempLow: "当日0時から最新時刻までの日最低気温で実況判定します。",
  dailyMinHumidity: "当日0時から最新時刻までの日最小相対湿度で実況判定します。",
  dailyMaxWind: "当日0時から最新時刻までの日最大風速で実況判定します。",
  dailyMaxGust: "当日0時から最新時刻までの日最大瞬間風速で実況判定します.",
  monthMax3hPrecip: "直近3時間降水量で実況判定します。",
  monthMax6hPrecip: "直近6時間降水量で実況判定します。",
  monthMax12hPrecip: "直近12時間降水量で実況判定します。",
  monthMax24hPrecip: "直近24時間降水量で実況判定します。",
  monthMax48hPrecip: "直近48時間降水量で実況判定します。",
  monthMax72hPrecip: "直近72時間降水量で実況判定します。",
  monthDeepSnowHigh: "現在の積雪深で実況判定します。",
  monthDeepSnowLow: "現在の積雪深で実況判定します。",
};

export const LIVE_SUPPORT_MODE_LABELS = {
  supported: "実況判定: 対応",
  partial: "実況判定: 一部対応",
  unsupported: "実況判定: 要素未対応",
  error: "実況判定: 取得失敗",
};

export const LIVE_SUPPORTED_ANNUAL_KEYS = new Set([
  "dailyPrecip",
  "max10mPrecip",
  "max1hPrecip",
  "dailyMaxTempHigh",
  "dailyMaxTempLow",
  "dailyMinTempHigh",
  "dailyMinTempLow",
  "dailyMinHumidity",
  "dailyMaxWind",
  "dailyMaxGust",
]);

/*
export const LIVE_SUPPORTED_MONTHLY_KEYS = new Set([
  //"monthMax3hPrecip",
  //"monthMax6hPrecip",
  //"monthMax12hPrecip",
  //"monthMax24hPrecip",
  //"monthMax48hPrecip",
  //"monthMax72hPrecip",
  //"monthDeepSnowHigh",
  //"monthDeepSnowLow",
]);
*/

export const LOW_IS_BETTER_KEYS = new Set([
  "dailyMaxTempLow",
  "dailyMinTempLow",
  "dailyMinHumidity",
  "monthPrecipLow",
  "monthAvgTempLow",
  "monthSunshineLow",
  "monthDeepSnowLow",
]);

export const LIVE_SUMMARY_ORDER = [
  "dailyPrecip",
  "max10mPrecip",
  "max1hPrecip",
  "dailyMaxTempHigh",
  "dailyMaxTempLow",
  "dailyMinTempHigh",
  "dailyMinTempLow",
  "dailyMinHumidity",
  "dailyMaxWind",
  "dailyMaxGust",
  "monthMax3hPrecip",
  "monthMax6hPrecip",
  "monthMax12hPrecip",
  "monthMax24hPrecip",
  "monthMax48hPrecip",
  "monthMax72hPrecip",
  "monthDeepSnowHigh",
  "monthDeepSnowLow",
];
