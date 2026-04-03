import os

from weather_common import (
    ELEMENTS,
    MONTHS,
    ensure_dir,
    fetch_latest_time,
    load_prefecture_configs,
    try_fetch_station_rows,
    write_json,
    build_dir_manifest,
)

BASE_DIR = "data_base"


def main():
    ensure_dir(BASE_DIR)

    prefectures = load_prefecture_configs()
    latest_iso = fetch_latest_time()

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]

        pref_dir = os.path.join(BASE_DIR, pref_key)
        ensure_dir(pref_dir)

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                rows = []

                for station in stations:
                    if not station.get(element_def["category"], False):
                        continue

                    try:
                        parsed = try_fetch_station_rows(station, element_def, month)

                        if not parsed:
                            continue

                        rows.append({
                            "stationName": station["stationName"],
                            "startDate": parsed["startDate"],
                            "records": parsed["records"],
                        })

                    except Exception:
                        continue

                output = {
                    "updatedAt": latest_iso,
                    "prefecture": pref_name,
                    "element": element_key,
                    "month": month,
                    "rows": rows,
                }

                file_name = f"{element_key}-{month}.json"
                write_json(os.path.join(pref_dir, file_name), output)
                print(f"wrote: {BASE_DIR}/{pref_key}/{file_name}")

    manifest = build_dir_manifest(BASE_DIR, latest_iso, prefectures)
    write_json(os.path.join(BASE_DIR, "manifest.json"), manifest)
    print(f"wrote: {BASE_DIR}/manifest.json")
    print("done rankings")


if __name__ == "__main__":
    main()
