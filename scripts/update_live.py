import os
from datetime import datetime

from weather_common import (
    ELEMENTS,
    MONTHS,
    JST,
    build_dir_manifest,
    dedupe_live_summary,
    ensure_dir,
    fetch_latest_time,
    fetch_today_live_extreme,
    load_prefecture_configs,
    merge_live,
    month_label,
    month_sort_key,
    read_json_file,
    write_json,
)

BASE_DIR = "data_base"
PUBLIC_DIR = "data"


def load_base_rows(pref_key: str, element_key: str, month: str):
    path = os.path.join(BASE_DIR, pref_key, f"{element_key}-{month}.json")
    if not os.path.exists(path):
        return None
    return read_json_file(path)


def main():
    ensure_dir(PUBLIC_DIR)

    prefectures = load_prefecture_configs()

    # 観測時刻（実況判定用）
    latest_obs_iso = fetch_latest_time()
    latest_dt = datetime.fromisoformat(latest_obs_iso.replace("Z", "+00:00")).astimezone(JST)

    # 表示用の更新時刻は「実際の生成時刻」
    generated_iso = datetime.now(JST).isoformat()

    for pref in prefectures:
        pref_key = pref["key"]
        pref_name = pref["name"]
        stations = pref["stations"]
        station_map = {s["stationName"]: s for s in stations}

        pref_dir = os.path.join(PUBLIC_DIR, pref_key)
        ensure_dir(pref_dir)

        live_summary_items = []

        for element_key, element_def in ELEMENTS.items():
            for month in MONTHS:
                base_data = load_base_rows(pref_key, element_key, month)
                rows = []

                if base_data:
                    for base_row in base_data.get("rows", []):
                        station_name = base_row["stationName"]
                        station = station_map.get(station_name)
                        if not station:
                            continue

                        try:
                            live_info = fetch_today_live_extreme(
                                station["amedasCode"],
                                latest_dt,
                                element_def["live_mode"],
                                month
                            )

                            ranks, live_summary_item = merge_live(
                                base_row["records"],
                                live_info,
                                element_def["direction"],
                                latest_dt
                            )

                            rows.append({
                                "stationName": station_name,
                                "startDate": base_row.get("startDate", ""),
                                "ranks": ranks,
                            })

                            if live_summary_item:
                                live_summary_items.append({
                                    "stationName": station_name,
                                    "elementKey": element_key,
                                    "elementLabel": element_def["labels"][0],
                                    "rank": live_summary_item["rank"],
                                    "value": live_summary_item["value"],
                                    "date": live_summary_item["date"],
                                    "monthLabel": month_label(month),
                                    "monthSort": month_sort_key(month),
                                })

                        except Exception:
                            continue

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
                print(f"wrote: {PUBLIC_DIR}/{pref_key}/{file_name}")

        live_summary_output = {
            "updatedAt": generated_iso,
            "observedLatestAt": latest_obs_iso,
            "prefecture": pref_name,
            "items": dedupe_live_summary(live_summary_items),
        }
        write_json(os.path.join(pref_dir, "live-summary.json"), live_summary_output)
        print(f"wrote: {PUBLIC_DIR}/{pref_key}/live-summary.json")

    manifest = build_dir_manifest(PUBLIC_DIR, generated_iso, prefectures)
    manifest["observedLatestAt"] = latest_obs_iso

    write_json(os.path.join(PUBLIC_DIR, "manifest.json"), manifest)
    print(f"wrote: {PUBLIC_DIR}/manifest.json")
    print("done live")


if __name__ == "__main__":
    main()
