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
        "rankView": "h0",
    }
]

ELEMENTS = {
    "dailyMaxTemp": {
        "label": "日最高気温の高い方から",
        "direction": "desc",
        "live_field": "temp",
    },
    "dailyMinTemp": {
        "label": "日最低気温の低い方から",
        "direction": "asc",
        "live_field": "temp",
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
    with urllib.request.urlopen(req, timeout=30) as res:
        raw = res.read()
    return raw.decode("utf-8", errors="ignore")


def fetch_json(url: str):
    return json.loads(fetch_text(url))


def normalize_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def html_to_lines(html: str):
    html = re.sub(r"(?is)<script.*?>.*?</script>", "", html)
    html = re.sub(r"(?is)<style.*?>.*?</style>", "", html)
    html = re.sub(r"(?i)<br\s*/?>", "\n", html)
    html = re.sub(r"(?i)</(tr|td|th|p|div|li|h1|h2|h3|h4|h5|h6|table|tbody|thead)>", "\n", html)
    html = re.sub(r"(?i)<[^>]+>", "", html)
    text = html_lib.unescape(html)
    lines = [normalize_spaces(x) for x in text.splitlines()]
    return [x for x in lines if x]


def build_rank_url(station: dict, month: str) -> str:
    month_value = "" if month == "all" else month
    return (
        "https://www.data.jma.go.jp/stats/etrn/view/rank_s.php"
        f"?prec_no={station['precNo']}"
        f"&block_no={station['blockNo']}"
        "&year="
        f"&month={month_value}"
        "&day="
        f"&view={station['rankView']}"
    )


def parse_rank_section(lines, target_label: str):
    start_idx = None
    for i, line in enumerate(lines):
        if normalize_spaces(line) == target_label:
            start_idx = i
            break

    if start_idx is None:
        return None

    # 次の要素行らしき場所まで切り出し
    section = []
    for line in lines[start_idx + 1:]:
        if "方から" in line or line.startswith("日") or line.startswith("月") or line.startswith("年"):
            # ただし値行 "(℃)39.3" などは除く
            if not line.startswith("("):
                if section:
                    break
        section.append(line)

    section_text = "".join(section)

    # 1～10位の値
    values = re.findall(r"\)(-?\d+(?:\.\d+)?)", section_text)
    values = [float(v) for v in values[:10]]

    # 1～10位の日付
    dates = re.findall(r"\((\d{4}/\d{1,2}/\d{1,2})\)", section_text)
    dates = [normalize_ymd(d) for d in dates[:10]]

    # 統計期間の開始と終了
    periods = re.findall(r"(?<!\d)(\d{4}/\d{1,2}|\d{4}年)(?!/\d)", section_text)
    start_date = periods[0] if len(periods) >= 1 else ""
    end_date = periods[1] if len(periods) >= 2 else ""

    records = []
    for idx, (v, d) in enumerate(zip(values, dates), start=1):
        records.append({
            "rank": idx,
            "value": trim_number(v),
            "date": d,
        })

    if not records:
        return None

    records = sort_records(records, "desc" if "高い方から" in target_label else "asc")

    # 順位を振り直す
    for i, rec in enumerate(records, start=1):
        rec["rank"] = i

    return {
        "startDate": start_date,
        "endDate": end_date,
        "records": records[:10],
    }


def normalize_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = m.groups()
    return f"{y}/{int(mo):02d}/{int(d):02d}"


def sort_records(records, direction: str):
    def key_desc(rec):
        return (float(rec["value"]), parse_date(rec["date"]))

    def key_asc(rec):
        # 値は小さい方優先、同値は新しい日付を優先
        return (float(rec["value"]), -parse_date(rec["date"]).timestamp())

    if direction == "desc":
        return sorted(records, key=lambda r: (float(r["value"]), parse_date(r["date"])), reverse=True)
    return sorted(records, key=key_asc)


def parse_date(s: str) -> datetime:
    return datetime.strptime(s, "%Y/%m/%d").replace(tzinfo=JST)


def trim_number(v):
    if float(v).is_integer():
        return int(v)
    return round(float(v), 1)


def fetch_latest_time() -> str:
    return fetch_text("https://www.jma.go.jp/bosai/amedas/data/latest_time.txt").strip()


def latest_map_key(latest_iso: str) -> str:
    # 例: 2026-03-30T07:50:00+09:00
    dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00"))
    dt = dt.astimezone(JST)
    return dt.strftime("%Y%m%d%H%M%S")


def fetch_latest_map_json():
    latest = fetch_latest_time()
    key = latest_map_key(latest)
    url = f"https://www.jma.go.jp/bosai/amedas/data/map/{key}.json"
    data = fetch_json(url)
    return latest, data


def within_one_year(date_str: str, now_dt: datetime) -> bool:
    try:
        d = parse_date(date_str)
    except Exception:
        return False
    return timedelta(0) <= (now_dt - d) <= timedelta(days=365)


def pick_live_value(map_json, amedas_code: str):
    item = map_json.get(str(amedas_code))
    if not item:
        return None
    temp = item.get("temp")
    if isinstance(temp, list) and len(temp) >= 1 and temp[0] is not None:
        try:
            return float(temp[0])
        except Exception:
            return None
    return None


def merge_live(records, live_value, direction, latest_dt: datetime):
    now_str = latest_dt.strftime("%Y/%m/%d")
    base = []
    for r in records:
        base.append({
            "rank": r["rank"],
            "value": r["value"],
            "date": r["date"],
            "highlightLive": False,
            "highlightWithinYear": within_one_year(r["date"], latest_dt),
        })

    if live_value is None:
        return base

    merged = []
    for r in records:
        merged.append({
            "value": float(r["value"]),
            "date": r["date"],
            "isLive": False,
        })

    merged.append({
        "value": float(live_value),
        "date": now_str,
        "isLive": True,
    })

    if direction == "desc":
        merged.sort(
            key=lambda x: (float(x["value"]), parse_date(x["date"])),
            reverse=True
        )
    else:
        merged.sort(
            key=lambda x: (float(x["value"]), -parse_date(x["date"]).timestamp())
        )

    merged = merged[:10]

    out = []
    for i, r in enumerate(merged, start=1):
        out.append({
            "rank": i,
            "value": trim_number(r["value"]),
            "date": r["date"],
            "highlightLive": bool(r.get("isLive")),
            "highlightWithinYear": within_one_year(r["date"], latest_dt),
        })
    return out


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def write_json(path: str, obj):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main():
    ensure_dir("data")

    latest_iso, latest_map = fetch_latest_map_json()
    latest_dt = datetime.fromisoformat(latest_iso.replace("Z", "+00:00")).astimezone(JST)

    for station in STATIONS:
        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                try:
                    url = build_rank_url(station, month)
                    html = fetch_text(url)
                    lines = html_to_lines(html)
                    parsed = parse_rank_section(lines, element_def["label"])

                    if not parsed:
                        rows = []
                    else:
                        live_value = pick_live_value(latest_map, station["amedasCode"])
                        ranks = merge_live(
                            parsed["records"],
                            live_value,
                            element_def["direction"],
                            latest_dt
                        )
                        rows = [{
                            "stationName": station["stationName"],
                            "startDate": parsed["startDate"],
                            "ranks": ranks,
                        }]

                    output = {
                        "updatedAt": latest_iso,
                        "prefecture": station["pref_name"],
                        "element": element_key,
                        "month": month,
                        "rows": rows,
                    }

                    file_name = f"{station['pref_key']}-{element_key}-{month}.json"
                    write_json(os.path.join("data", file_name), output)
                    print(f"wrote: data/{file_name}")

                except Exception as e:
                    print(f"failed: {station['stationName']} {element_key} {month}: {e}", file=sys.stderr)

    # ビルド確認用の簡易一覧
    manifest = {
        "updatedAt": latest_iso,
        "files": sorted(os.listdir("data"))
    }
    write_json(os.path.join("data", "manifest.json"), manifest)
    print("done")


if __name__ == "__main__":
    main()
