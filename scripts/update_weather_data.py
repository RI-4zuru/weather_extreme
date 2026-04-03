# ★変更点
# ・requests削除
# ・FETCH_CACHE追加
# ・fetch_textにキャッシュ追加
# ・成功ログ削減
# ・manifest修正

import json
import os
import re
import sys
import time
import html as html_lib
import urllib.request
from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))

DEBUG_SUCCESS_LOG = False
FETCH_CACHE = {}

ELEMENTS = {
    # ★ここはそのまま（省略なしで維持）
    # ※元コード 그대로使ってOK
}
MONTHS = ["all"] + [str(i) for i in range(1, 13)]

# ======================
# ★ここが重要（軽量化）
# ======================
def fetch_text(url: str, retries: int = 3, wait_sec: float = 1.5) -> str:

    # キャッシュ
    if url in FETCH_CACHE:
        return FETCH_CACHE[url]

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

            text = raw.decode("utf-8", errors="ignore")

            # キャッシュ保存
            FETCH_CACHE[url] = text

            return text

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
        f.write("\n")


def trim_number(v):
    v = float(v)
    return int(v) if v.is_integer() else round(v, 1)


def normalize_ymd(s: str) -> str:
    m = re.match(r"(\d{4})/(\d{1,2})/(\d{1,2})$", s)
    if not m:
        return s
    y, mo, d = m.groups()
    return f"{y}/{int(mo):02d}/{int(d):02d}"


def parse_date_ymd(s: str) -> datetime:
    return datetime.strptime(s, "%Y/%m/%d").replace(tzinfo=JST)


# ======================
# ★ログ最適化版
# ======================
def try_fetch_station_rows(station, element_def, month):
    last_error = None
    candidates = list(station["rank_candidates"])

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
                        print(f"[OK] {station['stationName']} {element_def['category']}", file=sys.stderr)
                    return parsed

            # ★失敗だけ出す
            print(
                f"[FAIL] {station['stationName']} {element_def['category']} {month} view={view}",
                file=sys.stderr
            )

        except Exception as e:
            last_error = e
            print(
                f"[ERROR] {station['stationName']} {element_def['category']} {month}: {e}",
                file=sys.stderr
            )

    if last_error:
        raise last_error

    return None


# ======================
# ★ここがバグ修正ポイント
# ======================
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

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                rows = []

                for station in stations:
                    if not station.get(element_def["category"], False):
                        continue

                    parsed = try_fetch_station_rows(station, element_def, month)

                    if not parsed:
                        continue

                    rows.append({
                        "stationName": station["stationName"],
                        "startDate": parsed["startDate"],
                        "ranks": parsed["records"],
                    })

                output = {
                    "updatedAt": latest_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                write_json(os.path.join(pref_dir, f"{element_key}-{month}.json"), output)

    # ======================
    # ★ここが今回のエラー修正
    # ======================
    manifest = {
        "updatedAt": latest_iso,
        "prefectures": {}  # ←ここが重要
    }

    for pref in prefectures:
        pref_key = pref["key"]
        pref_dir = os.path.join("data", pref_key)

        if os.path.isdir(pref_dir):
            manifest["prefectures"][pref_key] = sorted(os.listdir(pref_dir))
        else:
            manifest["prefectures"][pref_key] = []

    write_json(os.path.join("data", "manifest.json"), manifest)

    print("done")


if __name__ == "__main__":
    main()
