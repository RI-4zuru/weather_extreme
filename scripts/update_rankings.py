import os
from datetime import datetime

from weather_common import (
    ELEMENTS,
    MONTHS,
    JST,
    ensure_dir,
    fetch_latest_time,
    load_prefecture_configs,
    try_fetch_station_rows,
    write_json,
    build_dir_manifest,
)

BASE_DIR = "data"

REGION_KEY_MAP = {
    "北海道": "hokkaido",
    "東北": "tohoku",
    "関東甲信": "kanto_koshin",
    "北陸": "hokuriku",
    "東海": "tokai",
    "近畿": "kinki",
    "中国": "chugoku",
    "四国": "shikoku",
    "九州": "kyushu",
    "沖縄": "okinawa",
}


def normalize_region_dir(region_name: str) -> str:
    """
    都道府県設定の region 表記を、data 配下のディレクトリ名に変換する。
    未定義の地域は安全側で 'others' に落とす。
    """
    if not region_name:
        return "others"
    return REGION_KEY_MAP.get(region_name, "others")


def build_pref_output_dir(pref: dict) -> str:
    """
    県ごとの出力先ディレクトリを返す。
    例: data/kinki/nara
    """
    region_name = pref.get("region", "")
    region_dir = normalize_region_dir(region_name)
    pref_key = pref["key"]
    return os.path.join(BASE_DIR, region_dir, pref_key)


def main():
    ensure_dir(BASE_DIR)

    prefectures = load_prefecture_configs()

    # 観測時刻（内部計算や確認用）
    latest_obs_iso = fetch_latest_time()

    # 表示用の更新時刻は「実際の生成時刻」
    generated_iso = datetime.now(JST).isoformat()

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        pref_region = pref.get("region", "")
        stations = pref.get("stations", [])

        pref_dir = build_pref_output_dir(pref)
        ensure_dir(pref_dir)

        print(f"start: {pref_name} ({pref_region}) -> {pref_dir}")

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                rows = []

                for station in stations:
                    try:
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
                    except Exception as exc:
                        print(
                            f"skip station: pref={pref_key} "
                            f"station={station.get('stationName', '-')}, "
                            f"element={element_key}, month={month}, error={exc}"
                        )
                        continue

                output = {
                    "updatedAt": generated_iso,
                    "observedLatestAt": latest_obs_iso,
                    "prefecture": pref_name,
                    "region": pref_region,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                file_name = f"{element_key}-{month}.json"
                output_path = os.path.join(pref_dir, file_name)
                write_json(output_path, output)

                print(f"wrote: {output_path}")

    manifest = build_dir_manifest(BASE_DIR, generated_iso, prefectures)
    manifest["observedLatestAt"] = latest_obs_iso
    write_json(os.path.join(BASE_DIR, "manifest.json"), manifest)

    print(f"wrote: {BASE_DIR}/manifest.json")
    print("done rankings")


if __name__ == "__main__":
    main()
