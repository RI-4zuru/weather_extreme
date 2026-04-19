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
    "九州北部": "kyushu_north",
    "九州南部・奄美": "kyushu_south",
    "沖縄": "okinawa",
}


def normalize_region_dir(region_name: str) -> str:
    if not region_name:
        return "others"
    return REGION_KEY_MAP.get(region_name, "others")


def build_pref_output_dir(pref: dict) -> str:
    region_name = pref.get("region", "")
    region_dir = normalize_region_dir(region_name)
    pref_key = pref["key"]
    return os.path.join(BASE_DIR, region_dir, pref_key)


def main():
    ensure_dir(BASE_DIR)

    prefectures = load_prefecture_configs()
    latest_obs_iso = fetch_latest_time()
    generated_iso = datetime.now(JST).isoformat()

    written_file_count = 0
    processed_pref_count = 0
    skipped_pref_count = 0

    print("=== create base rankings start ===")
    print(f"prefecture count: {len(prefectures)}")

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        pref_region = pref.get("region", "")
        stations = pref.get("stations", [])

        pref_dir = build_pref_output_dir(pref)
        ensure_dir(pref_dir)

        print(f"[pref start] {pref_name} region={pref_region} output={pref_dir}")

        if not stations:
            print(f"[pref skip] {pref_name}: stations empty")
            skipped_pref_count += 1
            continue

        pref_written = 0

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

                    except Exception:
                        # 問題なさそうな個別欠落ログは出さずに黙ってスキップ
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

                pref_written += 1
                written_file_count += 1

        processed_pref_count += 1
        print(f"[pref done] {pref_name}: wrote {pref_written} files")

    manifest = build_dir_manifest(BASE_DIR, generated_iso, prefectures)
    manifest["observedLatestAt"] = latest_obs_iso
    manifest_path = os.path.join(BASE_DIR, "manifest.json")
    write_json(manifest_path, manifest)

    print("=== create base rankings done ===")
    print(f"processed prefectures: {processed_pref_count}")
    print(f"skipped prefectures: {skipped_pref_count}")
    print(f"written files: {written_file_count}")
    print(f"manifest: {manifest_path}")


if __name__ == "__main__":
    main()
