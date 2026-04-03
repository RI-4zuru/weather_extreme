import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import requests

JST = timezone(timedelta(hours=9))

# ===== 設定 =====
DEBUG_SUCCESS_LOG = False

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; weather-extreme-bot/1.0)"
})

FETCH_CACHE = {}

BASE_RANK_URL = "https://www.data.jma.go.jp/stats/etrn/view/rank_{}.php"


# ===== 共通処理 =====
def fetch_text(url: str) -> str:
    if url in FETCH_CACHE:
        return FETCH_CACHE[url]

    res = SESSION.get(url, timeout=30)
    res.raise_for_status()

    if not res.encoding or res.encoding.lower() == "iso-8859-1":
        res.encoding = res.apparent_encoding

    text = res.text
    FETCH_CACHE[url] = text
    return text


def build_rank_url(prec_no, rank_type, block_no, month, view):
    url = BASE_RANK_URL.format(rank_type)
    url += f"?prec_no={prec_no}&block_no={block_no}&year=&month="
    if month != "all":
        url += str(month)
    url += "&day=&view="
    if view:
        url += view
    return url


def find_target_row(html, labels):
    for label in labels:
        pattern = re.compile(rf"<tr[^>]*>.*?{re.escape(label)}.*?</tr>", re.S)
        m = pattern.search(html)
        if m:
            row_html = m.group(0)
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row_html, re.S)
            return cells
    return None


def parse_rank_cells(cells, direction):
    results = []
    for i in range(0, len(cells), 2):
        try:
            value = re.sub(r"<.*?>", "", cells[i]).strip()
            date = re.sub(r"<.*?>", "", cells[i + 1]).strip()
            if value:
                results.append({
                    "value": value,
                    "date": date
                })
        except:
            continue

    if direction == "asc":
        return results[::-1]
    return results


def parse_snow_records_from_html_text(html, labels, direction):
    # 簡易fallback（必要最低限）
    return None


# ===== メインロジック =====
def try_fetch_station_rows(station, element_def, month):
    last_error = None
    candidates = list(station["rank_candidates"])

    if element_def["category"] == "precip":
        order = {"np0": 0, "": 1, "h0": 2, "a2": 3, "ns0": 4}
        candidates.sort(key=lambda c: order.get(c.get("view", ""), 9))
    elif element_def["category"] == "snow":
        order = {"ns0": 0, "a2": 1, "np0": 2, "h0": 3, "": 4}
        candidates.sort(key=lambda c: order.get(c.get("view", ""), 9))

    for candidate in candidates:
        view = candidate.get("view", "")
        rank_type = candidate.get("rank_type", "")
        block_no = candidate.get("blockNo", "")

        try:
            url = build_rank_url(
                station["precNo"],
                rank_type,
                block_no,
                month,
                view,
            )

            html = fetch_text(url)
            cells = find_target_row(html, element_def["labels"])

            if cells:
                parsed = parse_rank_cells(cells, element_def["direction"])
                if parsed:
                    if DEBUG_SUCCESS_LOG:
                        print(
                            f"[rank ok] station={station['stationName']} "
                            f"category={element_def['category']} "
                            f"label={element_def['labels'][0]} month={month} "
                            f"view={view or '(blank)'} count={len(parsed)} url={url}",
                            file=sys.stderr
                        )
                    return parsed
                else:
                    print(
                        f"[rank cells found but parse empty] station={station['stationName']} "
                        f"category={element_def['category']} "
                        f"label={element_def['labels'][0]} month={month} "
                        f"view={view or '(blank)'} url={url}",
                        file=sys.stderr
                    )
            else:
                print(
                    f"[rank row not found] station={station['stationName']} "
                    f"category={element_def['category']} "
                    f"label={element_def['labels'][0]} month={month} "
                    f"view={view or '(blank)'} url={url}",
                    file=sys.stderr
                )

            if element_def["category"] == "snow":
                parsed_fallback = parse_snow_records_from_html_text(
                    html,
                    element_def["labels"],
                    element_def["direction"]
                )
                if parsed_fallback:
                    if DEBUG_SUCCESS_LOG:
                        print(
                            f"[snow fallback ok] station={station['stationName']} "
                            f"label={element_def['labels'][0]} month={month} "
                            f"view={view or '(blank)'} count={len(parsed_fallback)} url={url}",
                            file=sys.stderr
                        )
                    return parsed_fallback
                else:
                    print(
                        f"[snow fallback failed] station={station['stationName']} "
                        f"label={element_def['labels'][0]} month={month} "
                        f"view={view or '(blank)'} url={url}",
                        file=sys.stderr
                    )

        except Exception as e:
            last_error = e
            print(
                f"[rank fetch error] station={station['stationName']} "
                f"category={element_def['category']} "
                f"label={element_def['labels'][0]} month={month} "
                f"view={view or '(blank)'} blockNo={block_no} "
                f"rankType={rank_type} error={repr(e)}",
                file=sys.stderr
            )

    if last_error:
        raise last_error

    return None


# ===== 設定読み込み =====
def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    prefectures = load_json("config/prefectures.json")

    now = datetime.now(JST).isoformat()

    for pref in prefectures:
        if not pref.get("stationsFile"):
            continue

        stations = load_json(pref["stationsFile"])["stations"]

        for element in ["temp", "precip", "snow"]:
            element_def = {
                "labels": ["日最高気温の高い方から"],
                "direction": "desc",
                "category": element
            }

            for month in ["all"]:
                rows = []

                for station in stations:
                    if not station.get(element):
                        continue

                    try:
                        result = try_fetch_station_rows(station, element_def, month)
                        if result:
                            rows.append({
                                "station": station["stationName"],
                                "data": result
                            })
                    except Exception as e:
                        print(f"[fatal] {station['stationName']} {e}", file=sys.stderr)

                output = {
                    "updatedAt": now,
                    "rows": rows
                }

                path = f"data/{pref['key']}/{element}-{month}.json"
                write_json(path, output)

    manifest = {
        "updatedAt": now
    }

    write_json("data/manifest.json", manifest)


if __name__ == "__main__":
    main()
