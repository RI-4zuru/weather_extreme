export const DEFAULT_REGION = "近畿";
export const DEFAULT_PREF = "osaka";
export const DEFAULT_MONTH = "all";
export const DEFAULT_ELEMENT = "dailyPrecip";

export const ELEMENT_LABELS = {
  dailyPrecip: "日降水量",
  max10mPrecip: "日最大10分間降水量",
  max1hPrecip: "日最大1時間降水量",
  monthMax1h10mPrecip: "日最大1時間降水量(10分間隔)の多い方から",
  monthMax3hPrecip: "月最大3時間降水量の多い方から",
  monthMax6hPrecip: "月最大6時間降水量の多い方から",
  monthMax12hPrecip: "月最大12時間降水量の多い方から",
  monthMax24hPrecip: "月最大24時間降水量の多い方から",
  monthMax48hPrecip: "月最大48時間降水量の多い方から",
  monthMax72hPrecip: "月最大72時間降水量の多い方から",
  monthPrecipHigh: "月降水量の多い方から",
  monthPrecipLow: "月降水量の少ない方から",

  dailyMaxTempHigh: "日最高気温の高い方から",
  dailyMaxTempLow: "日最高気温の低い方から",
  dailyMinTempHigh: "日最低気温の高い方から",
  dailyMinTempLow: "日最低気温の低い方から",
  monthAvgTempHigh: "月平均気温の高い方から",
  monthAvgTempLow: "月平均気温の低い方から",

  dailyMinHumidity: "日最小相対湿度",

  dailyMaxWind: "日最大風速",
  dailyMaxGust: "日最大瞬間風速",

  monthSunshineHigh: "月間日照時間の多い方から",
  monthSunshineLow: "月間日照時間の少ない方から",

  dailySnowDepth: "降雪の深さ日合計",
  monthSnowDepth: "降雪の深さ月合計",
  monthMax3hSnow: "月最大3時間降雪量の多い方から",
  monthMax6hSnow: "月最大6時間降雪量の多い方から",
  monthMax12hSnow: "月最大12時間降雪量の多い方から",
  monthMax24hSnow: "月最大24時間降雪量の多い方から",
  monthMax48hSnow: "月最大48時間降雪量の多い方から",
  monthMax72hSnow: "月最大72時間降雪量の多い方から",
  monthDeepSnowHigh: "月最深積雪の大きい方から",
  monthDeepSnowLow: "月最深積雪の小さい方から"
};

export const ELEMENT_DESCRIPTIONS = {
  dailyPrecip: "各日の24時間降水量による順位です。",
  max10mPrecip: "各日に観測された10分間降水量の最大値による順位です。",
  max1hPrecip: "各日に観測された1時間降水量の最大値による順位です。",
  monthMax1h10mPrecip: "月内の10分値から算出した1時間積算降水量の最大値による順位です。",
  monthMax3hPrecip: "月内の3時間降水量最大値による順位です。",
  monthMax6hPrecip: "月内の6時間降水量最大値による順位です。",
  monthMax12hPrecip: "月内の12時間降水量最大値による順位です。",
  monthMax24hPrecip: "月内の24時間降水量最大値による順位です。",
  monthMax48hPrecip: "月内の48時間降水量最大値による順位です。",
  monthMax72hPrecip: "月内の72時間降水量最大値による順位です。",
  monthPrecipHigh: "月降水量の多い記録順です。",
  monthPrecipLow: "月降水量の少ない記録順です。",

  dailyMaxTempHigh: "日最高気温の高い記録順です。",
  dailyMaxTempLow: "日最高気温の低い記録順です。",
  dailyMinTempHigh: "日最低気温の高い記録順です。",
  dailyMinTempLow: "日最低気温の低い記録順です。",
  monthAvgTempHigh: "月平均気温の高い記録順です。",
  monthAvgTempLow: "月平均気温の低い記録順です。",

  dailyMinHumidity: "日最小相対湿度の低い記録順です。",

  dailyMaxWind: "日最大風速の大きい記録順です。",
  dailyMaxGust: "日最大瞬間風速の大きい記録順です。",

  monthSunshineHigh: "月間日照時間の多い記録順です。",
  monthSunshineLow: "月間日照時間の少ない記録順です。",

  dailySnowDepth: "日ごとの降雪の深さ合計による順位です。",
  monthSnowDepth: "月ごとの降雪の深さ合計による順位です。",
  monthMax3hSnow: "月内の3時間降雪量最大値による順位です。",
  monthMax6hSnow: "月内の6時間降雪量最大値による順位です。",
  monthMax12hSnow: "月内の12時間降雪量最大値による順位です。",
  monthMax24hSnow: "月内の24時間降雪量最大値による順位です。",
  monthMax48hSnow: "月内の48時間降雪量最大値による順位です。",
  monthMax72hSnow: "月内の72時間降雪量最大値による順位です。",
  monthDeepSnowHigh: "月最深積雪の大きい記録順です。",
  monthDeepSnowLow: "月最深積雪の小さい記録順です。"
};

export const LIVE_SUMMARY_ORDER = [
  "dailyPrecip",
  "max10mPrecip",
  "max1hPrecip",
  "monthMax1h10mPrecip",
  "monthMax3hPrecip",
  "monthMax6hPrecip",
  "monthMax12hPrecip",
  "monthMax24hPrecip",
  "monthMax48hPrecip",
  "monthMax72hPrecip",
  "monthPrecipHigh",
  "monthPrecipLow",
  "dailyMaxTempHigh",
  "dailyMaxTempLow",
  "dailyMinTempHigh",
  "dailyMinTempLow",
  "monthAvgTempHigh",
  "monthAvgTempLow",
  "dailyMinHumidity",
  "dailyMaxWind",
  "dailyMaxGust",
  "monthSunshineHigh",
  "monthSunshineLow",
  "dailySnowDepth",
  "monthSnowDepth",
  "monthMax3hSnow",
  "monthMax6hSnow",
  "monthMax12hSnow",
  "monthMax24hSnow",
  "monthMax48hSnow",
  "monthMax72hSnow",
  "monthDeepSnowHigh",
  "monthDeepSnowLow"
];
