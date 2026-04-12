import os
from typing import Any, Dict, List

from weather_common import ensure_dir, read_json_file, write_json

PUBLIC_DIR = "data"


def load_manifest() -> Dict[str, Any]:
    path = os.path.join(PUBLIC_DIR, "manifest.json")
    if not os.path.exists(path):
        return {}
    return read_json_file(path)


def load_elements_config() -> Dict[str, str]:
    path = os.path.join("config", "elements.json")
    if not os.path.exists(path):
        return {}

    data = read_json_file(path)
    label_map: Dict[str, str] = {}

    for item in data.get("annualElements", []):
        key = item.get("key")
        label = item.get("shortLabel") or item.get("label") or key
        if key:
            label_map[key] = label

    for item in data.get("monthlyElements", []):
        key = item.get("key")
        label = item.get("shortLabel") or item.get("label") or key
        if key and key not in label_map:
            label_map[key] = label

    return label_map


def normalize_pref_keys(prefectures_value: Any) -> List[str]:
    # manifest["prefectures"] が dict の場合
    if isinstance(prefectures_value, dict):
        return list(prefectures_value.keys())

    # 旧形式の list の場合
    result: List[str] = []
    if not isinstance(prefectures_value, list):
        return result

    for pref in prefectures_value:
        if isinstance(pref, str):
            result.append(pref)
        elif isinstance(pref, dict):
            key = pref.get("key")
            if key:
                result.append(key)

    return result


def sorted_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda x: (
            str(x.get("elementLabel", "")),
            int(x.get("rank", 999)),
            str(x.get("stationName", "")),
        ),
    )


def collect_live_items_from_pref(
    pref_key: str,
    element_label_map: Dict[str, str],
) -> Dict[str, List[Dict[str, Any]]]:
    pref_dir = os.path.join(PUBLIC_DIR, pref_key)
    if not os.path.isdir(pref_dir):
        return {"annualItems": [], "monthlyItems": []}

    annual_items: List[Dict[str, Any]] = []
    monthly_items: List[Dict[str, Any]] = []

    for file_name in os.listdir(pref_dir):
        if not file_name.endswith(".json"):
            continue
        if file_name == "live-summary.json":
            continue
        if "-" not in file_name:
            continue

        element_key, month_part = file_name[:-5].rsplit("-", 1)
        json_path = os.path.join(pref_dir, file_name)

        try:
            data = read_json_file(json_path)
        except Exception:
            continue

        rows = data.get("rows", [])
        observed_latest_at = data.get("observedLatestAt")

        for row in rows:
            live_rank = row.get("liveEnteredRank")
            if live_rank is None:
                continue

            ranks = row.get("ranks", [])
            rank_index = int(live_rank) - 1
            if rank_index < 0 or rank_index >= len(ranks):
                continue

            rank_data = ranks[rank_index]
            item = {
                "rank": live_rank,
                "elementKey": element_key,
                "elementLabel": element_label_map.get(element_key, element_key),
                "stationName": row.get("stationName", ""),
                "value": rank_data.get("value", ""),
                "date": rank_data.get("date", ""),
                "observedLatestAt": observed_latest_at,
            }

            if "windDirection" in rank_data:
                item["windDirection"] = rank_data.get("windDirection", "")

            if month_part == "all":
                annual_items.append(item)
            else:
                monthly_items.append(item)

    return {
        "annualItems": sorted_items(annual_items),
        "monthlyItems": sorted_items(monthly_items),
    }


def build_summary(
    pref_key: str,
    observed_latest_at: str,
    element_label_map: Dict[str, str],
) -> Dict[str, Any]:
    collected = collect_live_items_from_pref(pref_key, element_label_map)
    return {
        "prefecture": pref_key,
        "observedLatestAt": observed_latest_at,
        "annualItems": collected["annualItems"][:5],
        "monthlyItems": collected["monthlyItems"][:5],
    }


def update_manifest_observed_latest_at(observed_latest_at: str) -> None:
    manifest_path = os.path.join(PUBLIC_DIR, "manifest.json")
    manifest = load_manifest()
    manifest["observedLatestAt"] = observed_latest_at
    write_json(manifest_path, manifest)


def main() -> None:
    ensure_dir(PUBLIC_DIR)

    manifest = load_manifest()
    element_label_map = load_elements_config()

    pref_keys = normalize_pref_keys(manifest.get("prefectures", []))
    observed_latest_at = manifest.get("observedLatestAt", "")

    for pref_key in pref_keys:
        pref_dir = os.path.join(PUBLIC_DIR, pref_key)
        ensure_dir(pref_dir)

        summary = build_summary(pref_key, observed_latest_at, element_label_map)
        output_path = os.path.join(pref_dir, "live-summary.json")
        write_json(output_path, summary)
        print(f"wrote: {output_path}")

    update_manifest_observed_latest_at(observed_latest_at)
    print("done build live summary")


if __name__ == "__main__":
    main()
