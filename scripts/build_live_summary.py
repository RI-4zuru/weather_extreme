import json
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"


def read_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_rank_item(item):
    if not isinstance(item, dict):
        return None
    return {
        "rank": item.get("rank"),
        "value": item.get("value"),
        "date": item.get("date"),
        "highlightLive": bool(item.get("highlightLive")),
        "highlightWithinYear": bool(item.get("highlightWithinYear")),
    }


def extract_live_items_from_file(pref_key: str, element_key: str, month: str, file_path: Path):
    data = read_json(file_path)
    observed_latest_at = data.get("observedLatestAt")
    items = []

    for row in data.get("rows", []):
        station_name = row.get("stationName", "")
        for rank_item in row.get("ranks", []):
            rank_item = normalize_rank_item(rank_item)
            if not rank_item:
                continue
            if not rank_item["highlightLive"]:
                continue

            items.append(
                {
                    "stationName": station_name,
                    "elementKey": element_key,
                    "elementLabel": element_key,
                    "rank": rank_item["rank"],
                    "value": rank_item["value"],
                    "date": rank_item["date"],
                    "month": month,
                    "observedLatestAt": observed_latest_at,
                }
            )

    return observed_latest_at, items


def load_elements_config():
    path = REPO_ROOT / "config" / "elements.json"
    if not path.exists():
        return {}

    data = read_json(path)
    label_map = {}

    for key in ("annualElements", "monthlyElements"):
        for item in data.get(key, []):
            if "key" in item:
                label_map[item["key"]] = item.get("label") or item.get("shortLabel") or item["key"]

    return label_map


def dedupe_items(items):
    best = {}

    for item in items:
        key = (
            item.get("stationName"),
            item.get("elementKey"),
            item.get("rank"),
            item.get("month"),
            item.get("date"),
            str(item.get("value")),
        )

        current = best.get(key)
        if current is None:
            best[key] = item
            continue

        # 同一キーなら observedLatestAt が新しい方を採用
        old_obs = current.get("observedLatestAt") or ""
        new_obs = item.get("observedLatestAt") or ""
        if new_obs > old_obs:
            best[key] = item

    return list(best.values())


def sort_items(items, label_order):
    def key_func(item):
        ek = item.get("elementKey", "")
        return (
            label_order.get(ek, 9999),
            item.get("rank", 9999) if item.get("rank") is not None else 9999,
            item.get("stationName", ""),
        )

    return sorted(items, key=key_func)


def build_pref_summary(pref_dir: Path, label_map: dict):
    annual_items = []
    monthly_items = []
    observed_candidates = []
    updated_candidates = []

    for path in pref_dir.glob("*.json"):
        if path.name == "live-summary.json":
            continue

        name = path.stem
        if "-" not in name:
            continue

        element_key, month = name.rsplit("-", 1)
        if month not in {"all", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"}:
            continue

        observed_latest_at, items = extract_live_items_from_file(
            pref_dir.name,
            element_key,
            month,
            path,
        )

        try:
            raw = read_json(path)
            if raw.get("updatedAt"):
                updated_candidates.append(raw["updatedAt"])
        except Exception:
            pass

        if observed_latest_at:
            observed_candidates.append(observed_latest_at)

        for item in items:
            item["elementLabel"] = label_map.get(item["elementKey"], item["elementKey"])
            if month == "all":
                annual_items.append(item)
            else:
                monthly_items.append(item)

    annual_items = dedupe_items(annual_items)
    monthly_items = dedupe_items(monthly_items)

    label_order = {k: i for i, k in enumerate(label_map.keys())}
    annual_items = sort_items(annual_items, label_order)[:5]
    monthly_items = sort_items(monthly_items, label_order)[:5]

    return {
        "updatedAt": max(updated_candidates) if updated_candidates else None,
        "observedLatestAt": max(observed_candidates) if observed_candidates else None,
        "annualItems": [
            {
                "stationName": item["stationName"],
                "elementKey": item["elementKey"],
                "elementLabel": item["elementLabel"],
                "rank": item["rank"],
                "value": item["value"],
                "date": item["date"],
            }
            for item in annual_items
        ],
        "monthlyItems": [
            {
                "stationName": item["stationName"],
                "elementKey": item["elementKey"],
                "elementLabel": item["elementLabel"],
                "rank": item["rank"],
                "value": item["value"],
                "date": item["date"],
            }
            for item in monthly_items
        ],
    }


def update_manifest_observed_latest_at():
    manifest_path = DATA_DIR / "manifest.json"
    if not manifest_path.exists():
        return

    manifest = read_json(manifest_path)
    observed_list = []

    for pref in manifest.get("prefectures", []):
        if isinstance(pref, str):
            pref_key = pref
        else:
            pref_key = pref.get("key")
    
        if pref_key != "nara":
            continue
        if not pref_key:
            continue
        summary_path = DATA_DIR / pref_key / "live-summary.json"
        if not summary_path.exists():
            continue
        summary = read_json(summary_path)
        if summary.get("observedLatestAt"):
            observed_list.append(summary["observedLatestAt"])

    if observed_list:
        manifest["observedLatestAt"] = max(observed_list)
        write_json(manifest_path, manifest)


def main():
    if not DATA_DIR.exists():
        raise FileNotFoundError(f"{DATA_DIR} がありません")

    label_map = load_elements_config()

    for pref_dir in DATA_DIR.iterdir():
        if not pref_dir.is_dir():
            continue

        summary = build_pref_summary(pref_dir, label_map)
        write_json(pref_dir / "live-summary.json", summary)
        print(f"wrote: {pref_dir / 'live-summary.json'}")

    update_manifest_observed_latest_at()
    print("done build_live_summary")


if __name__ == "__main__":
    main()
