import json
import os
import re
import sys
import time
import html as html_lib
import urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))

ELEMENTS = {
    "dailyPrecip": {
        "labels": ["日降水量", "日降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_day_sum",
    },
    "max10mPrecip": {
        "labels": ["日最大10分間降水量", "日最大10分間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_10m_max",
    },
    "max1hPrecip": {
        "labels": ["日最大1時間降水量", "日最大1時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_1h_max",
    },
    "monthMax1h10mPrecip": {
        "labels": [
            "日最大1時間降水量(10分間隔)の多い方から",
            "日最大1時間降水量（10分間隔）の多い方から"
        ],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax3hPrecip": {
        "labels": ["月最大3時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax6hPrecip": {
        "labels": ["月最大6時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax12hPrecip": {
        "labels": ["月最大12時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax24hPrecip": {
        "labels": ["月最大24時間降水量", "月最大24時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax48hPrecip": {
        "labels": ["月最大48時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthMax72hPrecip": {
        "labels": ["月最大72時間降水量の多い方から"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthPrecipHigh": {
        "labels": ["月降水量の多い方から", "月降水量"],
        "direction": "desc",
        "category": "precip",
        "live_mode": None,
    },
    "monthPrecipLow": {
        "labels": ["月降水量の少ない方から"],
        "direction": "asc",
        "category": "precip",
        "live_mode": None,
    },
    "dailyMaxTempHigh": {
        "labels": ["日最高気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": "temp_max_day",
    },
    "dailyMaxTempLow": {
        "labels": ["日最高気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": "temp_max_day",
    },
    "dailyMinTempHigh": {
        "labels": ["日最低気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": "temp_min_day",
    },
    "dailyMinTempLow": {
        "labels": ["日最低気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": "temp_min_day",
    },
    "monthAvgTempHigh": {
        "labels": ["月平均気温の高い方から"],
        "direction": "desc",
        "category": "temp",
        "live_mode": None,
    },
    "monthAvgTempLow": {
        "labels": ["月平均気温の低い方から"],
        "direction": "asc",
        "category": "temp",
        "live_mode": None,
    },
    "dailyMinHumidity": {
        "labels": ["日最小相対湿度", "日最小相対湿度の低い方から"],
        "direction": "asc",
        "category": "humidity",
        "live_mode": None,
    },
    "dailyMaxWind": {
        "labels": ["日最大風速", "日最大風速の大きい方から"],
        "direction": "desc",
        "category": "wind",
        "live_mode": None,
    },
    "dailyMaxGust": {
        "labels": ["日最大瞬間風速", "日最大瞬間風速の大きい方から"],
        "direction": "desc",
        "category": "wind",
        "live_mode": None,
    },
    "monthSunshineHigh": {
        "labels": ["月間日照時間の多い方から", "月間日照時間"],
        "direction": "desc",
        "category": "sunshine",
        "live_mode": None,
    },
    "monthSunshineLow": {
        "labels": ["月間日照時間の少ない方から"],
        "direction": "asc",
        "category": "sunshine",
        "live_mode": None,
    },
    "dailySnowDepth": {
        "labels": [
            "降雪の深さ日合計",
            "日降雪量",
            "降雪の深さ日合計の大きい方から",
            "降雪の深さの日合計",
            "日合計降雪量",
            "日降雪の深さ"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthSnowDepth": {
        "labels": [
            "降雪の深さ月合計",
            "月降雪量",
            "降雪の深さ月合計の大きい方から",
            "降雪の深さの月合計",
            "月合計降雪量",
            "月降雪の深さ"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax3hSnow": {
        "labels": [
            "月最大3時間降雪量の多い方から",
            "月最大3時間降雪量",
            "3時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax6hSnow": {
        "labels": [
            "月最大6時間降雪量の多い方から",
            "月最大6時間降雪量",
            "6時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax12hSnow": {
        "labels": [
            "月最大12時間降雪量の多い方から",
            "月最大12時間降雪量",
            "12時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax24hSnow": {
        "labels": [
            "月最大24時間降雪量の多い方から",
            "月最大24時間降雪量",
            "24時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax48hSnow": {
        "labels": [
            "月最大48時間降雪量の多い方から",
            "月最大48時間降雪量",
            "48時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthMax72hSnow": {
        "labels": [
            "月最大72時間降雪量の多い方から",
            "月最大72時間降雪量",
            "月最大72時間降雪量>の多い方から",
            "72時間降雪量の多い方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowHigh": {
        "labels": [
            "月最深積雪の大きい方から",
            "月最深積雪",
            "最深積雪の大きい方から"
        ],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowLow": {
        "labels": [
            "月最深積雪の小さい方から",
            "最深積雪の小さい方から"
        ],
        "direction": "asc",
        "category": "snow",
        "live_mode": None,
    },
}

MONTHS = ["all"] + [str(i) for i in range(1, 13)]


def fetch_text(url: str, retries: int = 3, wait_sec: float = 1.5) -> str:
    last_error = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "Mozilla/5.0",
                    "Accept-Language": "ja,en;q=0.8",
                },
            )
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read()
            return raw.decode("utf-8", errors="ignore")
        except Exception as e:
            last_error = e
            if attempt < retries - 1:
                time.sleep(wait_sec)
    raise last_error


def fetch_json(url: str):
    return json.loads(fetch_text(url))


def read_json_file(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def trim_number(v):
    v = float(v)
    if v.is_integer():
        return int(v)
    return round(v, 1)


def normalize_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = m.groups()
    return f"{y}/{int(mo):02d}/{int(d):02d}"


def parse_date_ymd(s: str) -> datetime:
    return datetime.strptime(s, "%Y/%m/%d").replace(tzinfo=JST)


def era_name(year: int, month: int, day: int):
    dt = datetime(year, month, day)
    if dt >= datetime(2019, 5, 1):
        return ("令和", year - 2018)
    if dt >= datetime(1989, 1, 8):
        return ("平成", year - 1988)
    if dt >= datetime(1926, 12, 25):
        return ("昭和", year - 1925)
    if dt >= datetime(1912, 7, 30):
        return ("大正", year - 1911)
    return ("明治", year - 1867)


def wareki_year_only(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return ""
    y, mo, d = map(int, m.groups())
    era, era_year = era_name(y, mo, d)
    era_year_str = "元" if era_year == 1 else str(era_year)
    return f"{era}{era_year_str}年"


def wareki_year_only_from_ym(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})$", s)
    if not m:
        return ""
    y, mo = map(int, m.groups())
    era, era_year = era_name(y, mo, 1)
    era_year_str = "元" if era_year == 1 else str(era_year)
    return f"{era}{era_year_str}年"


def format_dual_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = map(int, m.groups())
    return f"{y}年{mo}月{d}日（{wareki_year_only(s)}）"


def format_dual_ym(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo = map(int, m.groups())
    return f"{y}年{mo}月（{wareki_year_only_from_ym(s)}）"


def build_rank_url(prec_no: str, rank_type: str, block_no: str, month: str, view: str) -> str:
    month_value = "" if month == "all" else month
    rank_page = "rank_s.php" if rank_type == "s" else "rank_a.php"
    return (
        f"https://www.data.jma.go.jp/stats/etrn/view/{rank_page}"
        f"?prec_no={prec_no}"
        f"&block_no={block_no}"
        f"&year=&month={month_value}&day=&view={view}"
    )


def strip_tags(text: str) -> str:
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?is)<.*?>", "", text)
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_row_blocks(html: str):
    return re.findall(r"(?is)<tr[^>]*>.*?</tr>", html)


def get_cells_from_row(row_html: str):
    cells = re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", row_html)
    return [strip_tags(c) for c in cells]


def normalize_label_text(s: str) -> str:
    s = html_lib.unescape(s)
    s = s.replace(" ", "").replace("　", "")
    s = s.replace(">", "").replace("]", "").replace("(", "").replace(")", "")
    s = s.replace("（", "").replace("）", "")
    s = s.replace("ヶ", "ケ")
    return s.strip()


def find_target_row(html, labels):
    rows = get_row_blocks(html)
    normalized_labels = [normalize_label_text(label) for label in labels]

    for row_html in rows:
        cells = get_cells_from_row(row_html)
        if not cells:
            continue

        first = normalize_label_text(cells[0])

        for label in normalized_labels:
            if label and label in first:
                return cells

    return None


def extract_value_and_date(cell: str):
    cell = html_lib.unescape(cell)
    cell = cell.replace("]", " ").replace(">", " ").strip()

    full_date_match = re.search(r"(\d{4}/\d{1,2}/\d{1,2})", cell)
    ym_match = re.search(r"(\d{4}/\d{1,2})(?!/\d)", cell)
    y_match = re.search(r"(?<!\d)(\d{4})(?!\d)", cell)

    raw_date = None
    date_label = None
    cell_without_date = cell

    if full_date_match:
        raw_date = normalize_ymd(full_date_match.group(1))
        date_label = format_dual_ymd(raw_date)
        cell_without_date = cell.replace(full_date_match.group(1), " ")
    elif ym_match:
        y, m = ym_match.group(1).split("/")
        raw_date = f"{int(y):04d}/{int(m):02d}/01"
        date_label = format_dual_ym(f"{int(y):04d}/{int(m):02d}")
        cell_without_date = cell.replace(ym_match.group(1), " ")
    elif y_match:
        y = y_match.group(1)
        raw_date = f"{y}/01/01"
        date_label = f"{y}年"
        cell_without_date = re.sub(rf"(?<!\d){re.escape(y)}(?!\d)", " ", cell, count=1)

    if raw_date is None or date_label is None:
        return None

    cleaned = cell_without_date
    cleaned = re.sub(r"\b(cm|mm|h)\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[年月日時分]", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    value_candidates = re.findall(r"-?\d+(?:\.\d+)?", cleaned)
    if not value_candidates:
        return None

    value = trim_number(value_candidates[-1])

    return {
        "value": value,
        "date": date_label,
        "_date_raw": raw_date,
    }


def parse_rank_cells(cells, direction: str):
    if len(cells) < 3:
        return None

    rank_cells = cells[1:11]

    start_date = ""
    for cell in reversed(cells):
        m = re.search(r"(\d{4}/\d{1,2})", cell)
        if m:
            start_date = m.group(1)
            break

    records = []
    for idx, cell in enumerate(rank_cells, start=1):
        extracted = extract_value_and_date(cell)
        if not extracted:
            continue

        records.append({
            "rank": idx,
            "value": extracted["value"],
            "date": extracted["date"],
            "_date_raw": extracted["_date_raw"],
        })

    if not records:
        return None

    if direction == "desc":
        records.sort(
            key=lambda r: (float(r["value"]), parse_date_ymd(r["_date_raw"])),
            reverse=True,
        )
    else:
        records.sort(
            key=lambda r: (float(r["value"]), -parse_date_ymd(r["_date_raw"]).timestamp())
        )

    for i, rec in enumerate(records[:10], start=1):
        rec["rank"] = i

    return {
        "startDate": format_dual_ym(start_date) if start_date else "",
        "records": records[:10],
    }


def fetch_latest_time() -> str:
    return fetch_text("https://www.jma.go.jp/bosai/amedas/data/latest_time.txt").strip()


def point_chunk_key(dt: datetime) -> str:
    base_hour = (dt.hour // 3) * 3
    return dt.strftime("%Y%m%d") + f"_{base_hour:02d}"


def fetch_point_chunk(amedas_code: str, chunk_key: str):
    url = f"https://www.jma.go.jp/bosai/amedas/data/point/{amedas_code}/{chunk_key}.json"
    return fetch_json(url)


def get_today_chunk_keys(latest_dt: datetime):
    out = []
    cur = latest_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    end = latest_dt.replace(hour=(latest_dt.hour // 3) * 3, minute=0, second=0, microsecond=0)
    while cur <= end:
        out.append(point_chunk_key(cur))
        cur += timedelta(hours=3)
    return out


def extract_today_series(point_json: dict, latest_dt: datetime, field_names):
    if isinstance(field_names, str):
        field_names = [field_names]

    out = []
    today = latest_dt.strftime("%Y%m%d")

    for ts, item in point_json.items():
        if not str(ts).startswith(today):
            continue

        for field_name in field_names:
            val = item.get(field_name)
            if isinstance(val, list) and len(val) >= 1 and val[0] is not None:
                try:
                    obs_dt = datetime.strptime(str(ts), "%Y%m%d%H%M%S").replace(tzinfo=JST)
                    out.append((obs_dt, float(val[0])))
                    break
                except Exception:
                    pass

    out.sort(key=lambda x: x[0])
    return out


def fetch_today_all_series(amedas_code: str, latest_dt: datetime, field_names):
    all_values = []
    seen = set()

    for ck in get_today_chunk_keys(latest_dt):
        try:
            point_json = fetch_point_chunk(amedas_code, ck)
            series = extract_today_series(point_json, latest_dt, field_names)
            for obs_dt, val in series:
                key = obs_dt.strftime("%Y%m%d%H%M%S")
                if key not in seen:
                    seen.add(key)
                    all_values.append((obs_dt, val))
        except Exception:
            pass

    all_values.sort(key=lambda x: x[0])
    return all_values


def should_show_live(month: str, latest_dt: datetime) -> bool:
    return month == "all" or month == str(latest_dt.month)


def fetch_today_live_extreme(amedas_code: str, latest_dt: datetime, mode: str, month: str):
    if not mode:
        return None
    if not should_show_live(month, latest_dt):
        return None

    if mode == "temp_max_day":
        series = fetch_today_all_series(amedas_code, latest_dt, "temp")
        if not series:
            return None
        best = max(series, key=lambda x: (x[1], x[0]))

    elif mode == "temp_min_day":
        series = fetch_today_all_series(amedas_code, latest_dt, "temp")
        if not series:
            return None
        best = min(series, key=lambda x: (x[1], -x[0].timestamp()))

    elif mode == "precip_day_sum":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        total = sum(v for _, v in series)
        best = (latest_dt, total)

    elif mode == "precip_10m_max":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        best = max(series, key=lambda x: (x[1], x[0]))

    elif mode == "precip_1h_max":
        series = fetch_today_all_series(amedas_code, latest_dt, ["precipitation10m", "precipitation"])
        if not series:
            return None
        best_val = None
        best_dt = None
        for i in range(len(series)):
            window = series[max(0, i - 5):i + 1]
            s = sum(v for _, v in window)
            dt = series[i][0]
            if best_val is None or s > best_val or (s == best_val and dt > best_dt):
                best_val = s
                best_dt = dt
        best = (best_dt, best_val)

    else:
        return None

    raw_date = best[0].strftime("%Y/%m/%d")
    return {
        "value": trim_number(best[1]),
        "date": format_dual_ymd(raw_date),
        "_date_raw": raw_date,
    }


def within_one_year(raw_date_str: str, now_dt: datetime) -> bool:
    try:
        d = parse_date_ymd(raw_date_str)
    except Exception:
        return False
    return timedelta(0) <= (now_dt - d) <= timedelta(days=365)


def merge_live(records, live_info, direction, latest_dt: datetime):
    merged = []
    for r in records:
        merged.append({
            "value": float(r["value"]),
            "date": r["date"],
            "_date_raw": r["_date_raw"],
            "isLive": False,
        })

    if live_info is not None:
        merged.append({
            "value": float(live_info["value"]),
            "date": live_info["date"],
            "_date_raw": live_info["_date_raw"],
            "isLive": True,
        })

    if direction == "desc":
        merged.sort(
            key=lambda x: (float(x["value"]), parse_date_ymd(x["_date_raw"])),
            reverse=True
        )
    else:
        merged.sort(
            key=lambda x: (float(x["value"]), -parse_date_ymd(x["_date_raw"]).timestamp())
        )

    merged = merged[:10]

    out = []
    live_summary_item = None

    for i, r in enumerate(merged, start=1):
        item = {
            "rank": i,
            "value": trim_number(r["value"]),
            "date": r["date"],
            "highlightLive": bool(r["isLive"]),
            "highlightWithinYear": within_one_year(r["_date_raw"], latest_dt),
        }
        out.append(item)

        if r["isLive"]:
            live_summary_item = {
                "rank": i,
                "value": trim_number(r["value"]),
                "date": r["date"],
            }

    return out, live_summary_item


def try_fetch_station_rows(station, element_def, month):
    last_error = None

    for candidate in station["rank_candidates"]:
        try:
            url = build_rank_url(
                station["precNo"],
                candidate["rank_type"],
                candidate["blockNo"],
                month,
                candidate["view"],
            )
            html = fetch_text(url)
            cells = find_target_row(html, element_def["labels"])
            if not cells:
                continue

            parsed = parse_rank_cells(cells, element_def["direction"])
            if parsed:
                return parsed

        except Exception as e:
            last_error = e

    if last_error:
        raise last_error

    return None


def load_prefecture_configs():
    pref_config = read_json_file("config/prefectures.json")
    prefectures = pref_config.get("prefectures", [])
    loaded = []

    for pref in prefectures:
        stations_file = pref.get("stationsFile")
        if not stations_file:
            continue

        station_data = read_json_file(stations_file)
        loaded.append({
            "key": pref["key"],
            "name": pref["name"],
            "stations": station_data.get("stations", [])
        })

    return loaded


def dedupe_live_summary(items):
    best = {}

    for item in items:
        key = (item["stationName"], item["elementKey"])
        old = best.get(key)

        if old is None:
            best[key] = item
            continue

        if item["rank"] < old["rank"]:
            best[key] = item
        elif item["rank"] == old["rank"]:
            if item["monthSort"] < old["monthSort"]:
                best[key] = item

    result = list(best.values())
    result.sort(key=lambda x: (x["rank"], x["stationName"], x["elementLabel"], x["monthSort"]))

    for item in result:
        item.pop("monthSort", None)

    return result


def month_label(month: str) -> str:
    return "通年" if month == "all" else f"{month}月"


def month_sort_key(month: str) -> int:
    return 0 if month == "all" else int(month)


def main():
    ensure_dir("data")

    prefectures = load_prefecture_configs()

    latest_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00")).astimezone(JST)

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]

        pref_dir = os.path.join("data", pref_key)
        ensure_dir(pref_dir)

        live_summary_items = []

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                rows = []

                for station in stations:
                    if not station.get(element_def["category"], False):
                        continue

                    try:
                        parsed = try_fetch_station_rows(station, element_def, month)

                        if not parsed:
                            print(f"row not found: {pref_key} / {station['stationName']} / {element_key} / {month}", file=sys.stderr)
                            continue

                        live_info = fetch_today_live_extreme(
                            station["amedasCode"],
                            latest_dt,
                            element_def["live_mode"],
                            month
                        )

                        ranks, live_summary_item = merge_live(
                            parsed["records"],
                            live_info,
                            element_def["direction"],
                            latest_dt
                        )

                        rows.append({
                            "stationName": station["stationName"],
                            "startDate": parsed["startDate"],
                            "ranks": ranks,
                        })

                        if live_summary_item:
                            live_summary_items.append({
                                "stationName": station["stationName"],
                                "elementKey": element_key,
                                "elementLabel": element_def["labels"][0],
                                "rank": live_summary_item["rank"],
                                "value": live_summary_item["value"],
                                "date": live_summary_item["date"],
                                "monthLabel": month_label(month),
                                "monthSort": month_sort_key(month)
                            })

                    except Exception as e:
                        print(f"failed: {pref_key} / {station['stationName']} / {element_key} / {month}: {e}", file=sys.stderr)

                output = {
                    "updatedAt": latest_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                file_name = f"{element_key}-{month}.json"
                write_json(os.path.join(pref_dir, file_name), output)
                print(f"wrote: data/{pref_key}/{file_name}")

        live_summary_output = {
            "updatedAt": latest_iso,
            "prefecture": pref_name,
            "items": dedupe_live_summary(live_summary_items)
        }
        write_json(os.path.join(pref_dir, "live-summary.json"), live_summary_output)
        print(f"wrote: data/{pref_key}/live-summary.json")

    manifest = {
        "updatedAt": latest_iso,
        "prefectures": {}
    }

    for pref in prefectures:
        pref_key = pref["key"]
        pref_dir = os.path.join("data", pref_key)
        if os.path.isdir(pref_dir):
            manifest["prefectures"][pref_key] = sorted(os.listdir(pref_dir))

    write_json(os.path.join("data", "manifest.json"), manifest)
    print("done")


if __name__ == "__main__":
    main()
