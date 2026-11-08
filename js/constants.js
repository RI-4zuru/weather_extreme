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
  dailyPrecip: "気象庁公表の日降水量（集計時点）を優先し、以後の10分値積算で上回った場合は参考値を表示します。",
  max10mPrecip: "当日0時から最新時刻までの10分降水量最大値で実況判定します。",
  max1hPrecip: "気象庁公表の日最大1時間降水量（分単位集計）を優先します。",
  max24hPrecip: "気象庁公表の日最大24時間降水量（10分間隔集計）で判定します。",
  monthMax3hPrecip: "気象庁公表の当日日最大3時間降水量で判定します。",
  monthMax6hPrecip: "気象庁公表の当日日最大6時間降水量で判定します。",
  monthMax12hPrecip: "気象庁公表の当日日最大12時間降水量で判定します。",
  monthMax24hPrecip: "気象庁公表の当日日最大24時間降水量で判定します。",
  monthMax48hPrecip: "気象庁公表の当日日最大48時間降水量で判定します。",
  monthMax72hPrecip: "気象庁公表の当日日最大72時間降水量で判定します。",
  dailyMaxTempHigh: "当日0時から最新時刻までの日最高気温で実況判定します。",
  dailyMaxTempLow: "当日0時から最新時刻までの日最高気温で実況判定します。",
  dailyMinTempHigh: "当日0時から最新時刻までの日最低気温で実況判定します。",
  dailyMinTempLow: "当日0時から最新時刻までの日最低気温で実況判定します。",
  dailyMinHumidity: "当日0時から最新時刻までの日最小相対湿度で実況判定します。",
  dailyMaxWind: "当日0時から最新時刻までの日最大風速で実況判定します。",
  dailyMaxGust: "当日0時から最新時刻までの日最大瞬間風速で実況判定します.",
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
  "max24hPrecip",
  "monthMax3hPrecip",
  "monthMax6hPrecip",
  "monthMax12hPrecip",
  "monthMax24hPrecip",
  "monthMax48hPrecip",
  "monthMax72hPrecip",
  "dailyMaxTempHigh",
  "dailyMaxTempLow",
  "dailyMinTempHigh",
  "dailyMinTempLow",
  "dailyMinHumidity",
  "dailyMaxWind",
  "dailyMaxGust",
]);

export const LIVE_SUPPORTED_MONTHLY_KEYS = new Set([
  "dailyPrecip", "max10mPrecip", "max1hPrecip", "max24hPrecip",
  "monthMax3hPrecip", "monthMax6hPrecip", "monthMax12hPrecip",
  "monthMax24hPrecip", "monthMax48hPrecip", "monthMax72hPrecip",
  "dailyMaxTempHigh", "dailyMaxTempLow", "dailyMinTempHigh", "dailyMinTempLow",
  "dailyMinHumidity", "dailyMaxWind", "dailyMaxGust",
]);

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
  "max24hPrecip",
  "monthMax3hPrecip",
  "monthMax6hPrecip",
  "monthMax12hPrecip",
  "monthMax24hPrecip",
  "monthMax48hPrecip",
  "monthMax72hPrecip",
  "dailyMaxTempHigh",
  "dailyMaxTempLow",
  "dailyMinTempHigh",
  "dailyMinTempLow",
  "dailyMinHumidity",
  "dailyMaxWind",
  "dailyMaxGust",
  "monthDeepSnowHigh",
  "monthDeepSnowLow",
];
