import json
import os
import re
import sys
import html as html_lib
import urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))

STATIONS = [
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "奈良",
        "precNo": "64",
        "blockNo": "47780",
        "amedasCode": "64036",
        "rank_type": "s",
        "rank_view": "h0",
        "temp": True,
        "precip": True,
    },
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "針",
        "precNo": "64",
        "blockNo": "0630",
        "amedasCode": "64041",
        "rank_type": "a",
        "rank_view": "a2",
        "temp": True,
        "precip": True,
    },
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "大宇陀",
        "precNo": "64",
        "blockNo": "0633",
        "amedasCode": "64101",
        "rank_type": "a",
        "rank_view": "h0",
        "temp": True,
        "precip": True,
    },
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "五條",
        "precNo": "64",
        "blockNo": "0635",
        "amedasCode": "64127",
        "rank_type": "a",
        "rank_view": "",
        "temp": True,
        "precip": True,
    },
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "上北山",
        "precNo": "64",
        "blockNo": "0957",
        "amedasCode": "64206",
        "rank_type": "a",
        "rank_view": "",
        "temp": True,
        "precip": True,
    },
    {
        "pref_key": "nara",
        "pref_name": "奈良県",
        "stationName": "風屋",
        "precNo": "64",
        "blockNo": "1228",
        "amedasCode": "64227",
        "rank_type": "a",
        "rank_view": "",
        "temp": True,
        "precip": True,
    },
]

ELEMENTS = {
    "dailyMaxTemp": {
        "label": "日最高気温の高い方から",
        "direction": "desc",
        "category": "temp",
        "live_mode": "temp_max_day",
    },
    "dailyMinTemp": {
        "label": "日最低気温の低い方から",
        "direction": "asc",
        "category": "temp",
        "live_mode": "temp_min_day",
    },
    "dailyPrecip": {
        "label": "日降水量の多い方から",
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_day_sum",
    },
    "max10mPrecip": {
        "label": "日最大10分間降水量の多い方から",
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_10m_max",
    },
    "max1hPrecip": {
        "label": "日最大1時間降水量の多い方から",
        "direction": "desc",
        "category": "precip",
        "live_mode": "precip_1h_max",
    },
}

MONTHS = ["all"] + [str(i) for i in range(1, 13)]


def fetch_text(url: str) -> str:
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


def fetch_json(url: str):
    return json.loads(fetch_text(url))


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def normalize_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


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


def build_rank_url(station: dict, month: str) -> str:
    month_value = "" if month == "all" else month
    rank_page = "rank_s.php" if station["rank_type"] == "s" else "rank_a.php"
    return (
        f"https://www.data.jma.go.jp/stats/etrn/view/{rank_page}"
        f"?prec_no={station['precNo']}"
        f"&block_no={station['blockNo']}"
        f"&year=&month={month_value}&day=&view={station['rank_view']}"
    )


def html_to_lines(html: str):
    html = re.sub(r"(?is)<script.*?>.*?</script>", "", html)
    html = re.sub(r"(?is)<style.*?>.*?</style>", "", html)
    html = re.sub(r"(?i)<br\s*/?>", "\n", html)
    html = re.sub(r"(?i)</(tr|td|th|p|div|li|h1|h2|h3|h4|h5|h6|table|tbody|thead)>", "\n", html)
    html = re.sub(r"(?i)<[^>]+>", "", html)
    text = html_lib.unescape(html)
    lines = [normalize_spaces(x) for x in text.splitlines()]
    return [x for x in lines if x]


def is_new_element_line(line: str) -> bool:
    keywords = [
        "方から", "日降水量", "日最大", "月降水量", "年降水量",
        "月平均気温", "年平均気温", "日最小相対湿度",
        "日最大風速", "日最大瞬間風速", "月間日照時間"
    ]
    return any(k in line for k in keywords)


def sort_records(records, direction: str):
    if direction == "desc":
        return sorted(
            records,
            key=lambda r: (float(r["value"]), parse_date_ymd(r["_date_raw"])),
            reverse=True
        )
    return sorted(
        records,
        key=lambda r: (float(r["value"]), -parse_date_ymd(r["_date_raw"]).timestamp())
    )


def parse_rank_section(lines, target_label: str, direction: str):
    start_idx = None
    for i, line in enumerate(lines):
        if normalize_spaces(line) == target_label:
            start_idx = i
            break

    if start_idx is None:
        return None

    section = []
    for line in lines[start_idx + 1:]:
        if is_new_element_line(line):
            break
        section.append(line)

    section_text = "".join(section)

    value_matches = re.findall(r"\)(-?\d+(?:\.\d+)?)", section_text)
    date_matches = re.findall(r"\((\d{4}/\d{1,2}/\d{1,2})\)", section_text)
    period_matches = re.findall(r"(?<!\d)(\d{4}/\d{1,2})(?!/\d)", section_text)

    start_date = period_matches[0] if period_matches else ""

    n = min(10, len(value_matches), len(date_matches))
    if n == 0:
        return None

    records = []
    for i in range(n):
        raw_date = normalize_ymd(date_matches[i])
        records.append({
            "rank": i + 1,
            "value": trim_number(value_matches[i]),
            "date": format_dual_ymd(raw_date),
            "_date_raw": raw_date,
        })

    records = sort_records(records, direction)[:10]
    for idx, rec in enumerate(records, start=1):
        rec["rank"] = idx

    return {
        "startDate": format_dual_ym(start_date) if start_date else "",
        "records": records,
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


def extract_today_series(point_json: dict, latest_dt: datetime, field_name: str):
    out = []
    today = latest_dt.strftime("%Y%m%d")

    for ts, item in point_json.items():
        if not str(ts).startswith(today):
            continue

        val = item.get(field_name)
        if isinstance(val, list) and len(val) >= 1 and val[0] is not None:
            try:
                obs_dt = datetime.strptime(str(ts), "%Y%m%d%H%M%S").replace(tzinfo=JST)
                out.append((obs_dt, float(val[0])))
            except Exception:
                pass

    out.sort(key=lambda x: x[0])
    return out


def fetch_today_all_series(amedas_code: str, latest_dt: datetime, field_name: str):
    all_values = []
    seen = set()

    for ck in get_today_chunk_keys(latest_dt):
        try:
            point_json = fetch_point_chunk(amedas_code, ck)
            series = extract_today_series(point_json, latest_dt, field_name)
            for obs_dt, val in series:
                key = obs_dt.strftime("%Y%m%d%H%M%S")
                if key not in seen:
                    seen.add(key)
                    all_values.append((obs_dt, val))
        except Exception:
            pass

    all_values.sort(key=lambda x: x[0])
    return all_values


def fetch_today_live_extreme(amedas_code: str, latest_dt: datetime, mode: str):
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
        series = fetch_today_all_series(amedas_code, latest_dt, "precipitation10m")
        if not series:
            return None
        total = sum(v for _, v in series)
        best = (latest_dt, total)

    elif mode == "precip_10m_max":
        series = fetch_today_all_series(amedas_code, latest_dt, "precipitation10m")
        if not series:
            return None
        best = max(series, key=lambda x: (x[1], x[0]))

    elif mode == "precip_1h_max":
        series = fetch_today_all_series(amedas_code, latest_dt, "precipitation10m")
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


def main():
    ensure_dir("data")

    latest_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00")).astimezone(JST)

    for element_key, element_def in ELEMENTS.items():
        for month in MONTHS:
            rows = []

            for station in STATIONS:
                if not station.get(element_def["category"], False):
                    continue

                try:
                    url = build_rank_url(station, month)
                    html = fetch_text(url)
                    lines = html_to_lines(html)

                    parsed = parse_rank_section(
                        lines,
                        element_def["label"],
                        element_def["direction"]
                    )
                    if not parsed:
                        continue

                    live_info = fetch_today_live_extreme(
                        station["amedasCode"],
                        latest_dt,
                        element_def["live_mode"]
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
                    print(
                        f"failed: {station['stationName']} {element_key} {month}: {e}",
                        file=sys.stderr
                    )

            output = {
                "updatedAt": latest_iso,
                "prefecture": "奈良県",
                "element": element_key,
                "month": month,
                "rows": rows,
            }

            file_name = f"nara-{element_key}-{month}.json"
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
