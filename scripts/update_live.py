import os
from datetime import datetime

from weather_common import (
    ELEMENTS,
    MONTHS,
    JST,
    build_dir_manifest,
    ensure_dir,
    fetch_latest_time,
    fetch_today_live_extreme,
    load_prefecture_configs,
    merge_live,
    read_json_file,
    write_json,
)

BASE_DIR = "data"


def load_base_rows(pref_key: str, element_key: str, month: str):
    path = os.path.join(BASE_DIR, pref_key, f"{element_key}-{month}.json")
    if not os.path.exists(path):
        return None
    return read_json_file(path)


def main():
    ensure_dir(BASE_DIR)
    prefectures = load_prefecture_configs()

    latest_obs_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(
        latest_obs_iso.replace("Z", "+00:00")
    ).astimezone(JST)

    generated_iso = datetime.now(JST).isoformat()

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]
        station_map = {s["stationName"]: s for s in stations}

        pref_dir = os.path.join(BASE_DIR, pref_key)
        ensure_dir(pref_dir)

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                base_data = load_base_rows(pref_key, element_key, month)
                if not base_data:
                    continue

                rows = []

                for base_row in base_data.get("rows", []):
                    station_name = base_row.get("stationName")
                    if not station_name:
                        continue

                    station = station_map.get(station_name)
                    if not station:
                        # 設定側に観測所が無い場合は、そのまま通す
                        rows.append(
                            {
                                "stationName": station_name,
                                "startDate": base_row.get("startDate", ""),
                                "ranks": base_row.get("ranks", []),
                            }
                        )
                        continue

                    try:
                        live_info = fetch_today_live_extreme(
                            station["amedasCode"],
                            latest_dt,
                            element_def["live_mode"],
                            month,
                        )

                        merged_ranks, _ = merge_live(
                            base_row.get("ranks", []),
                            live_info,
                            element_def["direction"],
                            latest_dt,
                        )

                        rows.append(
                            {
                                "stationName": station_name,
                                "startDate": base_row.get("startDate", ""),
                                "ranks": merged_ranks,
                            }
                        )

                    except Exception:
                        # 実況取得失敗でも元順位表は残す
                        rows.append(
                            {
                                "stationName": station_name,
                                "startDate": base_row.get("startDate", ""),
                                "ranks": base_row.get("ranks", []),
                            }
                        )

                output = {
                    "updatedAt": generated_iso,
                    "observedLatestAt": latest_obs_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                file_name = f"{element_key}-{month}.json"
                write_json(os.path.join(pref_dir, file_name), output)
                print(f"wrote: {BASE_DIR}/{pref_key}/{file_name}")

    manifest = build_dir_manifest(BASE_DIR, generated_iso, prefectures)
    manifest["observedLatestAt"] = latest_obs_iso
    write_json(os.path.join(BASE_DIR, "manifest.json"), manifest)
    print(f"wrote: {BASE_DIR}/manifest.json")

    print("done live")


if __name__ == "__main__":
    main()
