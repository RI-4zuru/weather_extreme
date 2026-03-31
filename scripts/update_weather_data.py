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
    "monthMax24hPrecip": {
        "labels": ["月最大24時間降水量", "月最大24時間降水量の多い方から"],
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
        "labels": ["降雪の深さ日合計", "日降雪量", "降雪の深さ日合計の大きい方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthSnowDepth": {
        "labels": ["降雪の深さ月合計", "月降雪量", "降雪の深さ月合計の大きい方から"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowHigh": {
        "labels": ["月最深積雪の大きい方から", "月最深積雪"],
        "direction": "desc",
        "category": "snow",
        "live_mode": None,
    },
    "monthDeepSnowLow": {
        "labels": ["月最深積雪の小さい方から"],
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


def find_target_row(html, labels):
    rows = get_row_blocks(html)
    normalized_labels = [re.sub(r"\s+", "", label) for label in labels]

    for row_html in rows:
        cells = get_cells_from_row(row_html)
        if not cells:
            continue

        first = re.sub(r"\s+", "", cells[0])

        for label in normalized_labels:
            if label in first:
                return cells

    return None


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
        date_match = re.search(r"(\d{4}/\d{1,2}/\d{1,2}|\d{4}/\d{1,2}|\d{4})", cell)
        value_match = re.search(r"(-?\d+(?:\.\d+)?)", cell)
        if not date_match or not value_match:
            continue

        raw_date = date_match.group(1)

        if re.fullmatch(r"\d{4}", raw_date):
            raw_date_sort = f"{raw_date}/01/01"
            date_label = f"{raw_date}年"
        elif re.fullmatch(r"\d{4}/\d{1,2}", raw_date):
            y, m = raw_date.split("/")
            raw_date_sort = f"{int(y):04d}/{int(m):02d}/01"
            date_label = format_dual_ym(f"{int(y):04d}/{int(m):02d}")
        else:
            raw_date_sort = normalize_ymd(raw_date)
            date_label = format_dual_ymd(raw_date_sort)

        value = trim_number(value_match.group(1))

        records.append({
            "rank": idx,
            "value": value,
            "date": date_label,
            "_date_raw": raw_date_sort,
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
    for i, r in enumerate(merged, start=1):
        out.append({
            "rank": i,
            "value": trim_number(r["value"]),
            "date": r["date"],
            "highlightLive": bool(r["isLive"]),
            "highlightWithinYear": within_one_year(r["_date_raw"], latest_dt),
        })
    return out


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


def main():
    ensure_dir("data")

    prefectures = load_prefecture_configs()

    latest_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00")).astimezone(JST)

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]

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

                        ranks = merge_live(
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

                    except Exception as e:
                        print(f"failed: {pref_key} / {station['stationName']} / {element_key} / {month}: {e}", file=sys.stderr)

                output = {
                    "updatedAt": latest_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                file_name = f"{pref_key}-{element_key}-{month}.json"
                write_json(os.path.join("data", file_name), output)
                print(f"wrote: data/{file_name}")

    manifest = {
        "updatedAt": latest_iso,
        "files": sorted(os.listdir("data"))
    }
    write_json(os.path.join("data", "manifest.json"), manifest)
    print("done")


if __name__ == "__main__":
    main()
